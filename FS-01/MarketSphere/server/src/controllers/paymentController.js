import mongoose from 'mongoose';
import { Payment } from '../models/Payment.js';
import { Order } from '../models/Order.js';
import { VendorOrder } from '../models/VendorOrder.js';
import { Commission } from '../models/Commission.js';
import {
  getRazorpayClient,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from '../config/razorpay.js';
import { config } from '../config/env.js';
import { checkTransactionSupport } from './orderController.js';

export const createRazorpayOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify order ownership: only the customer who placed the order (or an admin) may initiate payment
    const isOwner = order.customerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to initiate payment for this order',
      });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order has already been paid' });
    }

    if (order.orderStatus === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot initiate payment for a cancelled order' });
    }

    // Amount strictly calculated server-side from order record in paise
    const amountInPaise = Math.round(order.totalPrice * 100);
    const razorpay = getRazorpayClient();

    // Prevent duplicate payment-order creation:
    // If an active Payment record exists for this order in 'created' status with a valid razorpayOrderId,
    // reuse it instead of creating duplicate orders on Razorpay
    let payment = await Payment.findOne({ orderId: order._id, status: 'created' });

    let razorpayOrder;
    if (payment && payment.razorpayOrderId) {
      if (Math.round(payment.amount * 100) !== amountInPaise) {
        return res.status(400).json({
          success: false,
          message: 'Existing payment amount does not match the current order amount.',
        });
      }

      razorpayOrder = {
        id: payment.razorpayOrderId,
        amount: amountInPaise,
        currency: 'INR',
        status: 'created',
      };
    } else {
      if (razorpay) {
        razorpayOrder = await razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `receipt_${order.orderNumber}`,
          notes: {
            orderId: order._id.toString(),
            customerId: order.customerId.toString(),
          },
        });
      } else {
        if (config.nodeEnv === 'production') {
          return res.status(500).json({
            success: false,
            message: 'Payment gateway is not configured for production.',
          });
        }
        // Mock / Test order creation when credentials not set
        razorpayOrder = {
          id: `order_mock_${Date.now()}`,
          amount: amountInPaise,
          currency: 'INR',
          status: 'created',
        };
      }

      if (!payment) {
        payment = await Payment.create({
          orderId: order._id,
          customerId: order.customerId,
          paymentGateway: 'razorpay',
          razorpayOrderId: razorpayOrder.id,
          amount: order.totalPrice,
          currency: 'INR',
          status: 'created',
          receipt: `receipt_${order.orderNumber}`,
        });
      } else {
        payment.razorpayOrderId = razorpayOrder.id;
        await payment.save();
      }
    }

    res.status(200).json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        keyId: config.razorpay.keyId || 'rzp_test_mock',
        paymentId: payment._id,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Executes a reliable, atomic or safe-recoverable financial payment state transition
 * for the parent Order, associated VendorOrders, and platform Commissions.
 *
 * Topology Awareness:
 * - On Replica Set / Sharded Mongos: Executes inside a multi-document ACID transaction.
 * - On Standalone MongoDB: Executes a sequenced, safe transition:
 *   1. Persists gateway payment tokens.
 *   2. Confirms Order payment status first (order.paymentStatus = 'paid').
 *   3. Transitions child VendorOrders (paymentStatus = 'paid').
 *   4. Transitions Commissions to 'eligible_for_payout' only after Order is confirmed.
 *   5. Marks Payment record status as 'captured' ONLY when all records have reached consistent states.
 */
export const applyPaymentTransitions = async ({
  order,
  payment,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const topologyInfo = await checkTransactionSupport();

  if (topologyInfo.supported) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const expectedVOCount = order.vendorOrders?.length || 0;
        const expectedCommCount = expectedVOCount;
        const actualVOCount = await VendorOrder.countDocuments({ parentOrderId: order._id }, { session });
        const actualCommCount = await Commission.countDocuments({ orderId: order._id }, { session });

        const isRecordCountConsistent =
          expectedVOCount === 0
            ? (actualVOCount === 0 && actualCommCount === 0)
            : (actualVOCount === expectedVOCount && actualCommCount === expectedCommCount);

        if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
        if (razorpaySignature) payment.razorpaySignature = razorpaySignature;

        if (!isRecordCountConsistent) {
          payment.errorDetails = {
            reconciliationRequired: true,
            reason: `Record count mismatch: expected VOs ${expectedVOCount}, actual VOs ${actualVOCount}, expected Comms ${expectedCommCount}, actual Comms ${actualCommCount}`,
          };
          await payment.save({ session });
          return;
        }

        order.paymentStatus = 'paid';
        order.paidAt = order.paidAt || new Date();
        await order.save({ session });

        await VendorOrder.updateMany(
          { parentOrderId: order._id, paymentStatus: { $ne: 'paid' } },
          { $set: { paymentStatus: 'paid' } },
          { session }
        );

        await Commission.updateMany(
          { orderId: order._id, status: { $ne: 'eligible_for_payout' } },
          { $set: { status: 'eligible_for_payout' } },
          { session }
        );

        payment.status = 'captured';
        payment.errorDetails = null;
        await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone MongoDB Safe, Recoverable Transition
    // 1. Persist gateway identifiers on payment without marking status: 'captured'
    if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
    if (razorpaySignature) payment.razorpaySignature = razorpaySignature;

    // 2. Pre-transition verification: Ensure expected child entities exist before modifying state
    const expectedVOCount = order.vendorOrders?.length || 0;
    const expectedCommCount = expectedVOCount;
    const actualVOCount = await VendorOrder.countDocuments({ parentOrderId: order._id });
    const actualCommCount = await Commission.countDocuments({ orderId: order._id });

    const isRecordCountConsistent =
      expectedVOCount === 0
        ? (actualVOCount === 0 && actualCommCount === 0)
        : (actualVOCount === expectedVOCount && actualCommCount === expectedCommCount);

    if (!isRecordCountConsistent) {
      payment.errorDetails = {
        reconciliationRequired: true,
        reason: `Record count mismatch: expected VOs ${expectedVOCount}, actual VOs ${actualVOCount}, expected Comms ${expectedCommCount}, actual Comms ${actualCommCount}`,
      };
      await payment.save();
      return payment;
    }

    // 3. Confirm Order payment status first
    order.paymentStatus = 'paid';
    order.paidAt = order.paidAt || new Date();
    await order.save();

    // 4. Transition child VendorOrders
    await VendorOrder.updateMany(
      { parentOrderId: order._id, paymentStatus: { $ne: 'paid' } },
      { $set: { paymentStatus: 'paid' } }
    );

    // 5. Transition Commissions (strictly after parent Order is confirmed paid and all records verified)
    await Commission.updateMany(
      { orderId: order._id, status: { $ne: 'eligible_for_payout' } },
      { $set: { status: 'eligible_for_payout' } }
    );

    // 6. Post-transition verification: Ensure no pending items remain
    const pendingVOs = await VendorOrder.countDocuments({
      parentOrderId: order._id,
      paymentStatus: { $ne: 'paid' },
    });
    const pendingComms = await Commission.countDocuments({
      orderId: order._id,
      status: { $ne: 'eligible_for_payout' },
    });

    if (pendingVOs === 0 && pendingComms === 0) {
      payment.status = 'captured';
      payment.errorDetails = null;
      await payment.save();
    } else {
      payment.errorDetails = {
        reconciliationRequired: true,
        reason: `Record inconsistency detected: pending VOs ${pendingVOs}, pending Comms ${pendingComms}`,
      };
      await payment.save();
    }
  }

  return payment;
};

export const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify order ownership
    const isOwner = order.customerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to verify payment for this order',
      });
    }

    // Strict Gateway Order Pairing:
    // Match the submitted Razorpay order ID against the exact stored Razorpay order ID for this marketplace order
    const storedPayment = await Payment.findOne({
      orderId,
      razorpayOrderId,
    });
    if (!storedPayment || !storedPayment.razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: 'No active gateway payment order found for this marketplace order',
      });
    }

    if (storedPayment.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Payment gateway order pairing mismatch. Gateway order ID does not match the order record.',
      });
    }

    // Check if ALREADY fully processed and consistent across all entities
    const pendingVOs = await VendorOrder.countDocuments({
      parentOrderId: order._id,
      paymentStatus: { $ne: 'paid' },
    });
    const pendingComms = await Commission.countDocuments({
      orderId: order._id,
      status: { $ne: 'eligible_for_payout' },
    });

    const isFullyConsistent =
      order.paymentStatus === 'paid' &&
      storedPayment.status === 'captured' &&
      pendingVOs === 0 &&
      pendingComms === 0;

    if (isFullyConsistent) {
      return res.status(200).json({
        success: true,
        message: 'Payment has already been verified',
        data: storedPayment,
      });
    }

    if (!config.razorpay.keySecret) {
      return res.status(500).json({
        success: false,
        message: 'Payment verification service is unavailable. Gateway secret is not configured.',
      });
    }

    // Signature verification
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      storedPayment.status = 'failed';
      storedPayment.errorDetails = { reason: 'Invalid payment signature' };
      await storedPayment.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Verification failed.',
      });
    }

    // Execute or recover state transitions reliably
    await applyPaymentTransitions({
      order,
      payment: storedPayment,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (storedPayment.status !== 'captured' && storedPayment.errorDetails?.reconciliationRequired) {
      return res.status(409).json({
        success: false,
        message: 'Payment recovery requires manual reconciliation. Associated order records are missing or inconsistent.',
        errorDetails: storedPayment.errorDetails,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: storedPayment,
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentByOrderId = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    const isOwner = payment.customerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to view this payment',
      });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * Priority 4: Razorpay Webhook Handler
 * Endpoint: POST /api/v1/payments/webhook
 * Verifies webhook signatures using raw request body and updates payments/orders idempotently.
 */
export const handleRazorpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const isAuthentic = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isAuthentic) {
      console.warn('[Razorpay Webhook] Signature verification failed');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Razorpay Webhook] Processing event: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const rzpPaymentId = paymentEntity?.id;
      const orderId = paymentEntity?.notes?.orderId;

      let payment = null;
      if (orderId) {
        payment = await Payment.findOne({ orderId });
      } else if (rzpOrderId) {
        payment = await Payment.findOne({ razorpayOrderId: rzpOrderId });
      }

      if (payment) {
        const parentOrder = await Order.findById(payment.orderId);
        if (parentOrder) {
          const pendingVOs = await VendorOrder.countDocuments({
            parentOrderId: parentOrder._id,
            paymentStatus: { $ne: 'paid' },
          });
          const pendingComms = await Commission.countDocuments({
            orderId: parentOrder._id,
            status: { $ne: 'eligible_for_payout' },
          });

          const isFullyConsistent =
            parentOrder.paymentStatus === 'paid' &&
            payment.status === 'captured' &&
            pendingVOs === 0 &&
            pendingComms === 0;

          if (isFullyConsistent) {
            // Idempotent: already captured and consistent across all entities
            return res.status(200).json({ status: 'ok', message: 'Already processed' });
          }

          await applyPaymentTransitions({
            order: parentOrder,
            payment,
            razorpayPaymentId: rzpPaymentId,
            razorpaySignature: null,
          });
        }
      }
    } else if (event === 'payment.failed') {
      const paymentEntity = payload.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const orderId = paymentEntity?.notes?.orderId;
      const errorDesc = paymentEntity?.error_description || 'Payment failed';

      let payment = null;
      if (orderId) {
        payment = await Payment.findOne({ orderId });
      } else if (rzpOrderId) {
        payment = await Payment.findOne({ razorpayOrderId: rzpOrderId });
      }

      if (payment && payment.status !== 'captured') {
        payment.status = 'failed';
        payment.errorReason = errorDesc;
        await payment.save();

        await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'failed' });
        await VendorOrder.updateMany(
          { parentOrderId: payment.orderId },
          { paymentStatus: 'failed' }
        );
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[Razorpay Webhook Error]', error);
    next(error);
  }
};

/**
 * Scans for payments and orders that were confirmed paid on gateway but
 * remain inconsistent due to an interrupted process and no subsequent webhook.
 * Reconciles them safely up to a bounded batch size without extra dependencies.
 */
export const reconcileInconsistentPayments = async (olderThanMs = 15 * 60 * 1000, limit = 50) => {
  const cutoff = new Date(Date.now() - olderThanMs);
  const candidates = await Payment.find({
    razorpayOrderId: { $exists: true, $ne: null },
    updatedAt: { $lt: cutoff },
    status: { $in: ['created', 'authorized'] },
  }).limit(limit);

  let reconciledCount = 0;
  let flaggedCount = 0;

  for (const payment of candidates) {
    try {
      const order = await Order.findById(payment.orderId);
      if (!order || (order.paymentStatus !== 'paid' && !payment.razorpayPaymentId)) {
        continue;
      }

      await applyPaymentTransitions({
        order,
        payment,
        razorpayPaymentId: payment.razorpayPaymentId,
        razorpaySignature: payment.razorpaySignature,
      });

      if (payment.status === 'captured') {
        reconciledCount++;
      } else if (payment.errorDetails?.reconciliationRequired) {
        flaggedCount++;
      }
    } catch (err) {
      console.error(`[Reconcile Sweep] Failed to reconcile payment ${payment._id}:`, err);
    }
  }

  return { scannedCount: candidates.length, reconciledCount, flaggedCount };
};

let isRecoveryRunning = false;
let recoveryIntervalId = null;
let currentRecoveryIntervalMs = 15 * 60 * 1000;
let currentRecoveryOlderThanMs = 15 * 60 * 1000;
let currentRecoveryLimit = 50;

/**
 * Executes a single scheduled payment recovery run with concurrency guard.
 * Prevents multiple overlapping executions.
 * Verifies active database connection before executing.
 */
export const runScheduledPaymentRecovery = async (
  olderThanMs = currentRecoveryOlderThanMs,
  limit = currentRecoveryLimit
) => {
  if (isRecoveryRunning) {
    console.log('[PaymentRecoveryScheduler] Previous recovery sweep still in progress. Skipping overlapping execution.');
    return { skipped: true, reason: 'in_progress', scannedCount: 0, reconciledCount: 0, flaggedCount: 0 };
  }

  if (mongoose.connection.readyState !== 1) {
    console.log('[PaymentRecoveryScheduler] Database not connected. Skipping recovery execution.');
    return { skipped: true, reason: 'db_not_connected', scannedCount: 0, reconciledCount: 0, flaggedCount: 0 };
  }

  isRecoveryRunning = true;
  try {
    const result = await reconcileInconsistentPayments(olderThanMs, limit);
    if (result.scannedCount > 0) {
      console.log(`[PaymentRecoveryScheduler] Sweep completed: scanned ${result.scannedCount}, reconciled ${result.reconciledCount}, flagged ${result.flaggedCount}.`);
    }
    return { skipped: false, ...result };
  } catch (error) {
    console.error('[PaymentRecoveryScheduler] Execution failed:', error);
    throw error;
  } finally {
    isRecoveryRunning = false;
  }
};

/**
 * Starts recurring background payment recovery scheduler running every 15 minutes by default.
 * Recovers stale interrupted payment states safely.
 * Never prevents clean server shutdown (calls .unref() on the interval timer).
 */
export const startPaymentRecoveryScheduler = (
  intervalMs = 15 * 60 * 1000,
  olderThanMs = 15 * 60 * 1000,
  limit = 50
) => {
  if (recoveryIntervalId) {
    return recoveryIntervalId;
  }

  currentRecoveryIntervalMs = intervalMs;
  currentRecoveryOlderThanMs = olderThanMs;
  currentRecoveryLimit = limit;

  recoveryIntervalId = setInterval(async () => {
    try {
      await runScheduledPaymentRecovery(currentRecoveryOlderThanMs, currentRecoveryLimit);
    } catch (err) {
      // Handled and logged inside runScheduledPaymentRecovery; ensure background interval does not throw unhandled error
    }
  }, currentRecoveryIntervalMs);

  if (recoveryIntervalId && typeof recoveryIntervalId.unref === 'function') {
    recoveryIntervalId.unref();
  }

  console.log(`[PaymentRecoveryScheduler] Scheduled payment recovery initialized (every ${currentRecoveryIntervalMs / 60000}m, threshold: ${currentRecoveryOlderThanMs / 60000}m, limit: ${currentRecoveryLimit}).`);
  return recoveryIntervalId;
};

/**
 * Stops the recurring payment recovery scheduler cleanly.
 */
export const stopPaymentRecoveryScheduler = () => {
  if (recoveryIntervalId) {
    clearInterval(recoveryIntervalId);
    recoveryIntervalId = null;
    console.log('[PaymentRecoveryScheduler] Payment recovery scheduler stopped.');
  }
};

/**
 * Returns diagnostic metadata about the payment recovery scheduler.
 */
export const getPaymentRecoverySchedulerStatus = () => {
  return {
    isScheduled: recoveryIntervalId !== null,
    isJobActive: isRecoveryRunning,
    intervalMs: currentRecoveryIntervalMs,
    olderThanMs: currentRecoveryOlderThanMs,
    limit: currentRecoveryLimit,
  };
};
