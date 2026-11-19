import crypto from 'crypto';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { VendorOrder } from '../models/VendorOrder.js';
import { Commission } from '../models/Commission.js';
import { Product } from '../models/Product.js';
import { Vendor } from '../models/Vendor.js';
import { Coupon } from '../models/Coupon.js';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { config } from '../config/env.js';
import { buildVendorOrderInvoicePDF, buildParentOrderInvoicePDF } from '../services/invoiceService.js';

let cachedTopologyInfo = null;

// Recheck topology when the connection is re-established / avoid stale cache
if (mongoose.connection) {
  mongoose.connection.on('disconnected', () => {
    cachedTopologyInfo = null;
  });
  mongoose.connection.on('reconnected', () => {
    cachedTopologyInfo = null;
  });
  mongoose.connection.on('close', () => {
    cachedTopologyInfo = null;
  });
}

export const resetTransactionSupportCache = () => {
  cachedTopologyInfo = null;
};

/**
 * Authoritatively detects MongoDB deployment topology to determine if multi-document
 * ACID transactions are supported (Replica Set or Mongos Sharded Cluster) or if
 * standalone compensation rollback must be utilized.
 *
 * Distinguishes:
 * 1. Confirmed standalone
 * 2. Confirmed replica set with primary
 * 3. Confirmed mongos
 * 4. Unknown / detection failure
 */
export const checkTransactionSupport = async (forceRefresh = false) => {
  if (!forceRefresh && cachedTopologyInfo !== null && mongoose.connection.readyState === 1) {
    return cachedTopologyInfo;
  }

  if (mongoose.connection.readyState !== 1) {
    return {
      supported: false,
      topology: 'unknown',
      error: 'MongoDB connection is not in ready state',
    };
  }

  try {
    const client = mongoose.connection.client;
    const topology = client?.topology?.description;
    const topologyType = topology?.type;

    // 1. Check driver topology description
    if (topologyType === 'ReplicaSetWithPrimary') {
      const result = { supported: true, topology: 'replica_set', error: null };
      cachedTopologyInfo = result;
      return result;
    }

    if (topologyType === 'Sharded') {
      const result = { supported: true, topology: 'mongos', error: null };
      cachedTopologyInfo = result;
      return result;
    }

    // 2. Authoritative check via admin hello command
    if (mongoose.connection.db) {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });

      if (hello.setName) {
        const result = { supported: true, topology: 'replica_set', error: null };
        cachedTopologyInfo = result;
        return result;
      }

      if (hello.msg === 'isdbgrid') {
        const result = { supported: true, topology: 'mongos', error: null };
        cachedTopologyInfo = result;
        return result;
      }

      if (hello.isWritablePrimary && !hello.setName && !hello.msg) {
        const result = { supported: false, topology: 'standalone', error: null };
        cachedTopologyInfo = result;
        return result;
      }

      const servers = Array.from(topology?.servers?.values() || []);
      if (servers.some((s) => s.type === 'Standalone')) {
        const result = { supported: false, topology: 'standalone', error: null };
        cachedTopologyInfo = result;
        return result;
      }
    }

    // Unknown topology if unverified - never silently classify as standalone!
    return {
      supported: false,
      topology: 'unknown',
      error: 'Unable to definitively confirm MongoDB deployment topology',
    };
  } catch (err) {
    // Log safe diagnostic message without credentials
    console.error('[MongoDB Topology Detection Error]', err.message);
    // Never cache detection failure as standalone!
    return {
      supported: false,
      topology: 'unknown',
      error: err.message,
    };
  }
};

export const canonicalizePayload = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalizePayload);
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalizePayload(obj[key]);
      return acc;
    }, {});
};

export const LEASE_DURATION_MS = 30 * 1000; // 30-second processing lease

export class LeaseLostError extends Error {
  constructor(message = 'Processing lease lost or expired. Operation aborted.') {
    super(message);
    this.name = 'LeaseLostError';
    this.code = 'LEASE_LOST';
    this.statusCode = 409;
  }
}

export const assertAndAdvanceStage = async (idempotencyRecordId, workerToken, nextStage, extraFields = {}) => {
  if (!idempotencyRecordId || !workerToken) return null;

  const now = new Date();
  const updatedDoc = await IdempotencyKey.findOneAndUpdate(
    {
      _id: idempotencyRecordId,
      ownerToken: workerToken,
      status: 'in_progress',
      leaseExpiresAt: { $gt: now },
    },
    {
      $set: {
        mutationStage: nextStage,
        ...extraFields,
        updatedAt: now,
      },
    },
    { new: true }
  );

  if (!updatedDoc) {
    throw new LeaseLostError(`Worker lost ownership or lease expired before entering stage "${nextStage}".`);
  }

  return updatedDoc;
};

export const computeRequestHash = (body) => {
  const canonical = canonicalizePayload(body);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

export const createOrder = async (req, res, next) => {
  let session = null;
  let isTransactionActive = false;
  const deductedStock = [];
  const createdVendorOrderIds = [];
  const createdCommissionIds = [];
  let createdParentOrderId = null;
  let idempotencyRecord = null;
  const workerToken = crypto.randomUUID();
  let assignedOrderNumber = `MS-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  try {
    // 1. Topology verification: Stop before mutations if unknown
    const topologyInfo = await checkTransactionSupport();
    if (topologyInfo.topology === 'unknown') {
      return res.status(503).json({
        success: false,
        message: 'Service Unavailable: Unable to establish database topology for transactional processing. Please retry.',
        error: topologyInfo.error,
      });
    }

    const { items, shippingAddress, paymentMethod = 'razorpay', couponCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items in order' });
    }

    if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.postalCode) {
      return res.status(400).json({ success: false, message: 'Valid shipping address is required' });
    }

    // 2. Order Idempotency: Reserve BEFORE any stock decrement or order creation
    const rawIdempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const idempotencyKey = typeof rawIdempotencyKey === 'string' && rawIdempotencyKey.trim().length > 0
      ? rawIdempotencyKey.trim()
      : null;
    const requestHash = computeRequestHash(req.body);
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);

    if (idempotencyKey) {
      try {
        idempotencyRecord = await IdempotencyKey.create({
          key: idempotencyKey,
          userId: req.user._id,
          endpoint: 'POST /api/v1/orders',
          requestHash,
          status: 'in_progress',
          ownerToken: workerToken,
          leaseExpiresAt,
          mutationStage: 'reserved',
          orderNumber: assignedOrderNumber,
          expiresAt: null, // Protected: active records never expire via TTL
        });
      } catch (idempErr) {
        if (idempErr.code === 11000) {
          const existing = await IdempotencyKey.findOne({ userId: req.user._id, key: idempotencyKey });
          if (!existing) {
            return res.status(409).json({ success: false, message: 'Concurrent idempotency conflict. Please retry.' });
          }

          // Same key with different payload: return HTTP 409 Conflict
          if (existing.requestHash !== requestHash) {
            return res.status(409).json({
              success: false,
              message: 'Conflict: Idempotency-Key has already been used with a different request payload.',
            });
          }

          // A. Completed order: return previously stored successful response
          if (existing.status === 'completed') {
            return res.status(existing.responseStatus || 200).json(existing.responseBody);
          }

          // B. Reconciliation required: manual resolution needed; reject automatic re-execution
          if (existing.status === 'reconciliation_required') {
            return res.status(409).json({
              success: false,
              message: 'Order execution was interrupted and requires manual reconciliation. Automatic retry is blocked.',
              recoveryReason: existing.recoveryReason,
            });
          }

          // C. In progress: check active lease vs expired lease crash recovery
          if (existing.status === 'in_progress') {
            const now = new Date();
            const isLeaseActive = existing.leaseExpiresAt && new Date(existing.leaseExpiresAt) > now;

            if (isLeaseActive) {
              // Active lease: poll for completion or failure
              let waited = 0;
              while (waited < 3000) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                waited += 200;
                const polled = await IdempotencyKey.findOne({ userId: req.user._id, key: idempotencyKey });
                if (polled?.status === 'completed') {
                  return res.status(polled.responseStatus || 200).json(polled.responseBody);
                }
                if (polled?.status === 'reconciliation_required') {
                  return res.status(409).json({
                    success: false,
                    message: 'Order execution was interrupted and requires manual reconciliation. Automatic retry is blocked.',
                    recoveryReason: polled.recoveryReason,
                  });
                }
                if (polled?.status === 'failed' || !polled) {
                  break;
                }
              }

              // Re-check after polling
              const current = await IdempotencyKey.findOne({ userId: req.user._id, key: idempotencyKey });
              if (current?.status === 'completed') {
                return res.status(current.responseStatus || 200).json(current.responseBody);
              }
              if (current?.status === 'reconciliation_required') {
                return res.status(409).json({
                  success: false,
                  message: 'Order execution was interrupted and requires manual reconciliation. Automatic retry is blocked.',
                  recoveryReason: current.recoveryReason,
                });
              }

              // If still in_progress and lease is still unexpired, block execution
              if (current?.status === 'in_progress' && current.leaseExpiresAt && new Date(current.leaseExpiresAt) > new Date()) {
                return res.status(409).json({
                  success: false,
                  message: 'An order with this Idempotency-Key is currently being processed. Please retry shortly.',
                });
              }
            }

            // LEASE EXPIRED: Execute safe crash recovery
            // Step 1: Check if the order was already completed in the database (Scenario 7)
            const targetOrderNumber = existing.orderNumber;
            const existingOrder = targetOrderNumber
              ? await Order.findOne({ orderNumber: targetOrderNumber }).populate('vendorOrders')
              : (existing.orderId ? await Order.findById(existing.orderId).populate('vendorOrders') : null);

            if (existingOrder && existingOrder.vendorOrders?.length > 0) {
              // Order completed on disk prior to crash; complete idempotency record safely
              const completedData = {
                success: true,
                message: 'Order created successfully',
                data: existingOrder,
              };
              await IdempotencyKey.findByIdAndUpdate(existing._id, {
                $set: {
                  status: 'completed',
                  mutationStage: 'completed',
                  responseStatus: 201,
                  responseBody: completedData,
                  orderId: existingOrder._id,
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h retention
                },
              });
              return res.status(201).json(completedData);
            }

            // Step 2: Order was not completed. Assess safety based on topology and mutationStage
            const canUseTransactions = topologyInfo.supported;
            const isSafeToRecover = existing.mutationStage === 'reserved' || canUseTransactions;

            if (!isSafeToRecover) {
              // On standalone MongoDB, mutations cannot be proven undone if stage is past 'reserved'
              // Atomically transition to reconciliation_required and block execution
              const reconciled = await IdempotencyKey.findOneAndUpdate(
                {
                  _id: existing._id,
                  status: 'in_progress',
                  leaseExpiresAt: { $lte: new Date() },
                },
                {
                  $set: {
                    status: 'reconciliation_required',
                    recoveryReason: `Lease expired at mutation stage "${existing.mutationStage}" on standalone MongoDB without transaction atomicity. Requires manual inventory and order audit.`,
                    expiresAt: null, // protected from TTL
                    updatedAt: new Date(),
                  },
                },
                { new: true }
              );

              // Proactively block logical mutation IDs on products to prevent resumed stale workers from decrementing stock
              if (existing.orderNumber && items && Array.isArray(items)) {
                for (let i = 0; i < items.length; i++) {
                  const mId = `${existing.orderNumber}:${items[i].productId}:${i}`;
                  try {
                    await Product.findByIdAndUpdate(items[i].productId, {
                      $addToSet: { appliedMutations: mId },
                    });
                  } catch (blockErr) {
                    // Non-blocking
                  }
                }
              }

              return res.status(409).json({
                success: false,
                message: 'Order execution was interrupted and requires manual reconciliation. Automatic retry is blocked.',
                recoveryReason: reconciled?.recoveryReason || `Interrupted at stage "${existing.mutationStage}".`,
              });
            }

            // Step 3: Safe to recover! Atomically acquire the expired lease
            const acquiredLease = await IdempotencyKey.findOneAndUpdate(
              {
                _id: existing._id,
                status: 'in_progress',
                leaseExpiresAt: { $lte: new Date() },
              },
              {
                $set: {
                  ownerToken: workerToken,
                  leaseExpiresAt,
                  mutationStage: 'reserved',
                  orderNumber: assignedOrderNumber,
                  requestHash,
                  updatedAt: new Date(),
                },
              },
              { new: true }
            );

            if (!acquiredLease) {
              return res.status(409).json({
                success: false,
                message: 'Concurrent recovery conflict. Another worker acquired the processing lease. Please retry shortly.',
              });
            }

            idempotencyRecord = acquiredLease;
          }

          // D. Previously failed: allow retry by re-acquiring the record
          if (existing.status === 'failed') {
            const reacquired = await IdempotencyKey.findOneAndUpdate(
              { _id: existing._id, status: 'failed' },
              {
                $set: {
                  status: 'in_progress',
                  ownerToken: workerToken,
                  leaseExpiresAt,
                  mutationStage: 'reserved',
                  orderNumber: assignedOrderNumber,
                  requestHash,
                  expiresAt: null,
                  updatedAt: new Date(),
                },
              },
              { new: true }
            );
            if (!reacquired) {
              return res.status(409).json({
                success: false,
                message: 'Concurrent retry conflict. Please retry shortly.',
              });
            }
            idempotencyRecord = reacquired;
          }
        } else {
          throw idempErr;
        }
      }
    }

    // 3. Initiate transaction session if confirmed replica set or mongos
    const canUseTransactions = topologyInfo.supported;
    if (canUseTransactions) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        isTransactionActive = true;
      } catch (sessionErr) {
        if (session) {
          session.endSession();
          session = null;
        }
        isTransactionActive = false;
      }
    }

    const sessionOpts = session ? { session } : {};

    // 1. Initial validation of products, availability, and active prices
    const validatedItems = [];
    const vendorGroupMap = new Map();
    let itemsPrice = 0;

    if (idempotencyRecord) {
      await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'stock_mutating');
    }

    const orderNumber = idempotencyRecord?.orderNumber || assignedOrderNumber;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const mutationId = idempotencyRecord ? `${orderNumber}:${item.productId}:${itemIndex}` : null;

      // Re-verify lease ownership before each product mutation
      if (idempotencyRecord) {
        await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'stock_mutating');
      }

      const product = session
        ? await Product.findById(item.productId).session(session)
        : await Product.findById(item.productId);

      if (!product || product.status === 'archived') {
        const error = new Error(`Product not found or unavailable: ${item.productId}`);
        error.statusCode = 404;
        throw error;
      }

      if (product.stock < item.quantity) {
        const error = new Error(`Insufficient stock for product "${product.title}". Available: ${product.stock}`);
        error.statusCode = 400;
        throw error;
      }

      // Atomic conditional stock decrement with per-order-item mutation deduplication
      const updateQuery = {
        _id: product._id,
        stock: { $gte: item.quantity },
        ...(mutationId ? { appliedMutations: { $ne: mutationId } } : {}),
      };
      const updateOp = {
        $inc: { stock: -item.quantity },
        ...(mutationId ? { $push: { appliedMutations: mutationId } } : {}),
      };
      const updatedProduct = session
        ? await Product.findOneAndUpdate(updateQuery, updateOp, { new: true, session })
        : await Product.findOneAndUpdate(updateQuery, updateOp, { new: true });

      if (!updatedProduct) {
        // Distinguish if failure was due to duplicate applied mutation
        if (mutationId) {
          const alreadyApplied = await Product.findOne({ _id: product._id, appliedMutations: mutationId });
          if (alreadyApplied) {
            const error = new Error(`Inventory mutation "${mutationId}" was already applied by another worker or process.`);
            error.statusCode = 409;
            error.code = 'MUTATION_ALREADY_APPLIED';
            throw error;
          }
        }

        const error = new Error(`Concurrent stock reservation conflict for "${product.title}". Please try again.`);
        error.statusCode = 409;
        throw error;
      }

      deductedStock.push({ productId: product._id, quantity: item.quantity, mutationId });

      const activePrice = product.discountPrice || product.price;
      const itemSubtotal = activePrice * item.quantity;
      itemsPrice += itemSubtotal;

      const itemGstRate = product.gstRate !== undefined ? product.gstRate : config.currency.defaultGstPercent;

      const orderItem = {
        productId: product._id,
        title: product.title,
        price: activePrice,
        quantity: item.quantity,
        image: product.images?.[0] || '',
        sku: product.sku || '',
        gstRate: itemGstRate,
        taxAmount: 0, // Computed after coupon discount
        vendorId: product.vendorId,
      };

      validatedItems.push(orderItem);

      // Group by vendor
      const vId = product.vendorId.toString();
      if (!vendorGroupMap.has(vId)) {
        vendorGroupMap.set(vId, []);
      }
      vendorGroupMap.get(vId).push(orderItem);
    }

    // 2. Coupon discount calculation
    let discountAmount = 0;
    let couponMeta = { code: '', discount: 0 };
    if (couponCode) {
      const couponQuery = Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      const coupon = session ? await couponQuery.session(session) : await couponQuery;

      if (coupon) {
        const check = coupon.isValidForOrder(itemsPrice);
        if (check.valid) {
          discountAmount = coupon.calculateDiscount(itemsPrice);
          couponMeta = { code: coupon.code, discount: discountAmount };
          coupon.usedCount += 1;
          if (session) {
            await coupon.save({ session });
          } else {
            await coupon.save();
          }
        }
      }
    }

    // 3. Product-Specific GST Calculation
    const discountRatio = itemsPrice > 0 ? discountAmount / itemsPrice : 0;
    let totalTaxPrice = 0;

    for (const item of validatedItems) {
      const itemSubtotal = item.price * item.quantity;
      const taxableItemSubtotal = Math.max(0, itemSubtotal * (1 - discountRatio));
      const itemTax = Math.round(taxableItemSubtotal * (item.gstRate / 100) * 100) / 100;
      item.taxAmount = itemTax;
      totalTaxPrice += itemTax;
    }

    totalTaxPrice = Math.round(totalTaxPrice * 100) / 100;

    // Shipping calculations
    const freeShippingThreshold = config.currency.freeShippingThreshold;
    const shippingPrice = itemsPrice >= freeShippingThreshold ? 0 : config.currency.defaultShippingFee;
    const taxableSubtotal = Math.max(0, itemsPrice - discountAmount);
    const totalPrice = Math.round((taxableSubtotal + shippingPrice + totalTaxPrice) * 100) / 100;

    if (idempotencyRecord) {
      await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'stock_decremented');
    }

    // 4. Create Parent Order (Priority 1: MUST ALWAYS START AS 'pending' and paidAt: null)
    if (idempotencyRecord) {
      await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'order_creating');
    }

    const parentOrderData = {
      orderNumber,
      customerId: req.user._id,
      items: validatedItems,
      shippingAddress: {
        fullName: shippingAddress.fullName || req.user.name,
        phone: shippingAddress.phone || req.user.phone || '',
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state || 'Maharashtra',
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country || 'India',
      },
      paymentMethod,
      paymentStatus: 'pending', // NEVER mark paid prematurely
      orderStatus: 'placed',
      currency: 'INR',
      itemsPrice: Math.round(itemsPrice * 100) / 100,
      shippingPrice: Math.round(shippingPrice * 100) / 100,
      taxPrice: totalTaxPrice,
      discountAmount: Math.round(discountAmount * 100) / 100,
      totalPrice,
      couponApplied: couponMeta,
      paidAt: null, // Only set upon verified payment
    };

    let parentOrder;
    if (session) {
      const created = await Order.create([parentOrderData], { session });
      parentOrder = created[0];
    } else {
      parentOrder = await Order.create(parentOrderData);
      createdParentOrderId = parentOrder._id;
    }

    if (idempotencyRecord) {
      await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'order_created', { orderId: parentOrder._id });
      await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'suborders_creating');
    }

    // 5. Create Vendor-specific suborders (VendorOrder) & Commission records
    const vendorOrderIds = [];
    let subOrderIndex = 1;

    for (const [vendorUserId, vendorItems] of vendorGroupMap.entries()) {
      const vendorQuery = Vendor.findOne({ userId: vendorUserId });
      const vendorRecord = session ? await vendorQuery.session(session) : await vendorQuery;
      const commissionRate = vendorRecord?.commissionRate || config.currency.defaultCommissionPercent;

      const vendorSubtotal = vendorItems.reduce((acc, it) => acc + it.price * it.quantity, 0);
      const vendorTaxAmount = vendorItems.reduce((acc, it) => acc + it.taxAmount, 0);
      const commissionAmount = Math.round(vendorSubtotal * (commissionRate / 100) * 100) / 100;
      const gstOnCommission = Math.round(commissionAmount * 0.18 * 100) / 100;
      const vendorPayoutAmount = Math.round((vendorSubtotal - commissionAmount - gstOnCommission) * 100) / 100;

      const vendorOrderNumber = `${orderNumber}-V${subOrderIndex++}`;

      const vendorSuborderData = {
        vendorOrderNumber,
        parentOrderId: parentOrder._id,
        vendorId: vendorUserId,
        customerId: req.user._id,
        items: vendorItems,
        subtotal: Math.round(vendorSubtotal * 100) / 100,
        shippingFee: 0,
        taxAmount: Math.round(vendorTaxAmount * 100) / 100,
        vendorTotal: Math.round((vendorSubtotal + vendorTaxAmount) * 100) / 100,
        commissionRate,
        commissionAmount,
        vendorPayoutAmount,
        orderStatus: 'placed',
        paymentStatus: 'pending', // Inherit pending payment status
      };

      let vendorSuborder;
      if (session) {
        const createdSuborders = await VendorOrder.create([vendorSuborderData], { session });
        vendorSuborder = createdSuborders[0];
      } else {
        vendorSuborder = await VendorOrder.create(vendorSuborderData);
        createdVendorOrderIds.push(vendorSuborder._id);
      }

      vendorOrderIds.push(vendorSuborder._id);

      // Record platform commission (initially pending)
      const commissionData = {
        orderId: parentOrder._id,
        vendorOrderId: vendorSuborder._id,
        vendorId: vendorUserId,
        grossAmount: Math.round(vendorSubtotal * 100) / 100,
        commissionRate,
        commissionAmount,
        gstOnCommission,
        netVendorPayout: vendorPayoutAmount,
        status: 'pending',
      };

      if (session) {
        await Commission.create([commissionData], { session });
      } else {
        const createdCommission = await Commission.create(commissionData);
        createdCommissionIds.push(createdCommission._id);
      }
    }

    // Attach suborders to parent order
    parentOrder.vendorOrders = vendorOrderIds;
    if (session) {
      await parentOrder.save({ session });
      await session.commitTransaction();
    } else {
      await parentOrder.save();
    }

    if (idempotencyRecord) {
      await assertAndAdvanceStage(idempotencyRecord._id, workerToken, 'suborders_created');
    }

    const responseData = {
      success: true,
      message: 'Order created successfully',
      data: parentOrder,
    };

    if (idempotencyRecord) {
      const completedDoc = await IdempotencyKey.findOneAndUpdate(
        {
          _id: idempotencyRecord._id,
          ownerToken: workerToken,
          status: 'in_progress',
          leaseExpiresAt: { $gt: new Date() },
        },
        {
          $set: {
            status: 'completed',
            mutationStage: 'completed',
            responseStatus: 201,
            responseBody: responseData,
            orderId: parentOrder._id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour retention
          },
        },
        { new: true }
      );

      if (!completedDoc) {
        throw new LeaseLostError('Worker lost ownership or lease expired before final completion.');
      }
    }

    res.status(201).json(responseData);
  } catch (error) {
    const isLeaseLost = error instanceof LeaseLostError || error.code === 'LEASE_LOST';

    if (idempotencyRecord && workerToken && !isLeaseLost) {
      try {
        await IdempotencyKey.findOneAndUpdate(
          {
            _id: idempotencyRecord._id,
            ownerToken: workerToken,
            status: 'in_progress',
            leaseExpiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: 'failed',
              mutationStage: 'reserved',
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour retention
            },
          }
        );
      } catch (cleanupIdempErr) {
        console.error('[Idempotency Cleanup Error]', cleanupIdempErr.message);
      }
    }

    if (isTransactionActive && session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('[Transaction Abort Error]', abortErr.message);
      }
    } else if (!isLeaseLost) {
      // Manual compensation rollback in standalone development environments
      // Only execute rollback if this worker STILL holds a valid active lease!
      let canCompensate = true;
      if (idempotencyRecord && workerToken) {
        const activeKey = await IdempotencyKey.findOne({
          _id: idempotencyRecord._id,
          ownerToken: workerToken,
          status: { $in: ['in_progress', 'failed'] },
          leaseExpiresAt: { $gt: new Date() },
        });
        if (!activeKey) {
          canCompensate = false;
          console.warn('[Compensation Skipped] Worker lease expired or ownership lost; preserving state for reconciliation.');
        }
      }

      if (canCompensate) {
        // 1. Revert deducted stock using safe resource-level conditional CAS
        for (const item of deductedStock) {
          try {
            if (item.mutationId) {
              // Resource-level atomic CAS:
              // Only increment stock if the exact mutationId is STILL PRESENT in appliedMutations!
              // Atomically pulls the mutationId and increments stock in a single document operation.
              const rollbackResult = await Product.findOneAndUpdate(
                {
                  _id: item.productId,
                  appliedMutations: item.mutationId,
                },
                {
                  $inc: { stock: item.quantity },
                  $pull: { appliedMutations: item.mutationId },
                },
                { new: true }
              );

              if (!rollbackResult) {
                console.warn(
                  `[Stock Rollback Skipped] Mutation "${item.mutationId}" not present on product ${item.productId}. No stock modified.`
                );
              }
            } else {
              await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
            }
          } catch (rollbackErr) {
            console.error('[Stock Rollback Error]', rollbackErr.message);
          }
        }

        // 2. Clean up partially created entities in reverse dependency order
        if (createdCommissionIds.length > 0) {
          try {
            await Commission.deleteMany({ _id: { $in: createdCommissionIds } });
          } catch (cleanupErr) {
            console.error('[Commission Cleanup Error]', cleanupErr.message);
          }
        }

        if (createdVendorOrderIds.length > 0) {
          try {
            await VendorOrder.deleteMany({ _id: { $in: createdVendorOrderIds } });
          } catch (cleanupErr) {
            console.error('[VendorOrder Cleanup Error]', cleanupErr.message);
          }
        }

        if (createdParentOrderId) {
          try {
            await Order.findByIdAndDelete(createdParentOrderId);
          } catch (cleanupErr) {
            console.error('[Order Cleanup Error]', cleanupErr.message);
          }
        }
      }
    }

    if (isLeaseLost) {
      return res.status(409).json({
        success: false,
        message: 'Order processing lease was lost or expired. Operation aborted to preserve concurrency integrity.',
        code: 'LEASE_LOST',
      });
    }

    next(error);
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

export const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customerId: req.user._id })
      .populate('vendorOrders')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('vendorOrders')
      .populate('items.productId', 'title images slug sku');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isCustomerOwner = order.customerId._id.toString() === req.user._id.toString();
    const isVendorForOrder = order.items.some(
      (item) => item.vendorId.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isCustomerOwner && !isVendorForOrder && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Not authorized to view this order',
      });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const getVendorOrders = async (req, res, next) => {
  try {
    const vendorSuborders = await VendorOrder.find({ vendorId: req.user._id })
      .populate('customerId', 'name email phone')
      .populate('parentOrderId', 'orderNumber shippingAddress paymentMethod paymentStatus')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: vendorSuborders });
  } catch (error) {
    next(error);
  }
};

export const updateVendorOrderStatus = async (req, res, next) => {
  try {
    const { status, trackingNumber } = req.body;
    const vendorOrder = await VendorOrder.findById(req.params.id);

    if (!vendorOrder) {
      return res.status(404).json({ success: false, message: 'Vendor suborder not found' });
    }

    if (vendorOrder.vendorId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Not authorized for this suborder' });
    }

    if (status) vendorOrder.orderStatus = status;
    if (trackingNumber) vendorOrder.trackingNumber = trackingNumber;
    if (status === 'delivered') vendorOrder.deliveredAt = new Date();

    await vendorOrder.save();

    res.status(200).json({
      success: true,
      message: 'Suborder status updated successfully',
      data: vendorOrder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/orders/:id/invoice
 * Downloads PDF Tax Invoice for a parent order (or specific vendor suborder via ?suborderId=)
 */
export const downloadOrderInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { suborderId, vendorOrderId } = req.query;
    const targetSuborderId = suborderId || vendorOrderId || null;

    await buildParentOrderInvoicePDF(id, req.user, res, targetSuborderId);
  } catch (error) {
    if (res.headersSent) {
      console.error('[Invoice Stream Error]', error);
      return;
    }
    if (error.status === 403) {
      return res.status(403).json({ success: false, message: error.message });
    }
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * GET /api/v1/orders/vendor-orders/:id/invoice
 * Downloads PDF Tax Invoice directly for a specific VendorOrder
 */
export const downloadVendorOrderInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    await buildVendorOrderInvoicePDF(id, req.user, res);
  } catch (error) {
    if (res.headersSent) {
      console.error('[Invoice Stream Error]', error);
      return;
    }
    if (error.status === 403) {
      return res.status(403).json({ success: false, message: error.message });
    }
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * Safely prunes confirmed completed inventory mutations older than `olderThanMs`.
 *
 * Safety guarantees:
 * 1. Only prunes mutations whose corresponding IdempotencyKey has reached status: 'completed'
 *    AND whose completion/update timestamp is older than `olderThanMs` (default: 24h).
 * 2. NEVER touches records in 'reconciliation_required', 'in_progress', or 'failed' status.
 * 3. Pulls confirmed old mutation IDs from Product.appliedMutations, preventing unbounded array growth
 *    while strictly preserving concurrency fencing for all active or unresolved transactions.
 */
export const pruneCompletedMutations = async (olderThanMs = 24 * 60 * 60 * 1000) => {
  const cutoff = new Date(Date.now() - olderThanMs);
  const completedKeys = await IdempotencyKey.find({
    status: 'completed',
    updatedAt: { $lt: cutoff },
    orderNumber: { $exists: true, $ne: '' },
  }).select('orderNumber');

  let prunedCount = 0;
  for (const record of completedKeys) {
    if (!record.orderNumber) continue;
    const updateResult = await Product.updateMany(
      { appliedMutations: { $regex: new RegExp(`^${record.orderNumber}:`) } },
      { $pull: { appliedMutations: { $regex: new RegExp(`^${record.orderNumber}:`) } } }
    );
    prunedCount += updateResult.modifiedCount;
  }

  return { prunedCount, eligibleRecords: completedKeys.length };
};

let isPruningRunning = false;
let pruningIntervalId = null;
let currentIntervalMs = 6 * 60 * 60 * 1000;
let currentRetentionMs = 24 * 60 * 60 * 1000;

/**
 * Executes a single scheduled mutation pruning run with concurrency guard.
 * Prevents multiple overlapping executions.
 */
export const runScheduledPruning = async (retentionMs = currentRetentionMs) => {
  if (isPruningRunning) {
    console.log('[PruneScheduler] Previous pruning run still in progress. Skipping overlapping execution.');
    return { skipped: true, reason: 'in_progress', prunedCount: 0 };
  }

  isPruningRunning = true;
  try {
    const result = await pruneCompletedMutations(retentionMs);
    console.log(`[PruneScheduler] Completed: pruned ${result.prunedCount} mutations across ${result.eligibleRecords} records.`);
    return { skipped: false, ...result };
  } catch (error) {
    console.error('[PruneScheduler] Execution failed:', error);
    throw error;
  } finally {
    isPruningRunning = false;
  }
};

/**
 * Starts recurring background scheduler running every 6 hours by default.
 * Retains 24-hour safety window for completed idempotency records.
 * Never prevents clean server shutdown (calls .unref() on the interval timer).
 */
export const startMutationPruningScheduler = (
  intervalMs = 6 * 60 * 60 * 1000,
  retentionMs = 24 * 60 * 60 * 1000
) => {
  if (pruningIntervalId) {
    return pruningIntervalId;
  }

  currentIntervalMs = intervalMs;
  currentRetentionMs = retentionMs;

  pruningIntervalId = setInterval(async () => {
    try {
      await runScheduledPruning(currentRetentionMs);
    } catch (err) {
      // Handled and logged inside runScheduledPruning; ensure background interval does not throw unhandled error
    }
  }, currentIntervalMs);

  // Allow Node.js event loop to terminate cleanly without hanging on this timer
  if (pruningIntervalId && typeof pruningIntervalId.unref === 'function') {
    pruningIntervalId.unref();
  }

  console.log(`[PruneScheduler] Scheduled mutation pruning initialized (every ${currentIntervalMs / 3600000}h, retention: ${currentRetentionMs / 3600000}h).`);
  return pruningIntervalId;
};

/**
 * Stops the recurring scheduler cleanly.
 */
export const stopMutationPruningScheduler = () => {
  if (pruningIntervalId) {
    clearInterval(pruningIntervalId);
    pruningIntervalId = null;
    console.log('[PruneScheduler] Mutation pruning scheduler stopped.');
  }
};

/**
 * Returns diagnostic metadata about the mutation pruning scheduler.
 */
export const getPruningSchedulerStatus = () => {
  return {
    isScheduled: pruningIntervalId !== null,
    isJobActive: isPruningRunning,
    intervalMs: currentIntervalMs,
    retentionMs: currentRetentionMs,
  };
};
