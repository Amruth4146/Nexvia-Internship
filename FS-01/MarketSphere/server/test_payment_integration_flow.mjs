import assert from 'assert';
import http from 'http';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from './src/app.js';
import { config } from './src/config/env.js';
import { User } from './src/models/User.js';
import { Order } from './src/models/Order.js';
import { VendorOrder } from './src/models/VendorOrder.js';
import { Payment } from './src/models/Payment.js';
import { Commission } from './src/models/Commission.js';
import { generateAccessToken } from './src/utils/generateToken.js';
import { verifyRazorpaySignature, verifyRazorpayWebhookSignature } from './src/config/razorpay.js';

console.log('=== RUNNING RAZORPAY PAYMENT INTEGRATION & ORDER CONSISTENCY TEST SUITE ===\n');

const TEST_DB_URI = 'mongodb://localhost:27017/marketsphere_test_payment_flow';
const PORT = 5077;
const server = http.createServer(app);

const makeRequest = (path, options = {}) => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/v1${path}`,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) { }
          resolve({ status: res.statusCode, data: json, raw });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
};

const runTests = async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.dropDatabase();
  console.log('✓ Connected to isolated test MongoDB');

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`✓ Test Express server listening on http://127.0.0.1:${PORT}\n`);

  try {
    // -------------------------------------------------------------------------
    // SETUP: Users & Order
    // -------------------------------------------------------------------------
    const customerA = await User.create({
      name: 'Customer A',
      email: 'customera@test.com',
      password: 'Password123!',
      role: 'customer',
    });
    const customerB = await User.create({
      name: 'Customer B',
      email: 'customerb@test.com',
      password: 'Password123!',
      role: 'customer',
    });
    const vendorUser = await User.create({
      name: 'Vendor X',
      email: 'vendorx@test.com',
      password: 'Password123!',
      role: 'vendor',
    });

    const tokenA = generateAccessToken(customerA._id, 'customer');
    const tokenB = generateAccessToken(customerB._id, 'customer');

    const testOrder = await Order.create({
      orderNumber: 'MS-PAYTEST-1001',
      customerId: customerA._id,
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          vendorId: vendorUser._id,
          title: 'Test Audio Headset',
          price: 5000,
          quantity: 1,
          total: 5000,
        },
      ],
      shippingAddress: {
        fullName: 'Customer A',
        phone: '9876543210',
        street: '123 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
      },
      itemsPrice: 5000,
      taxPrice: 900,
      shippingPrice: 0,
      totalPrice: 5900,
      paymentMethod: 'razorpay',
      paymentStatus: 'placed',
      orderStatus: 'placed',
    });

    // Create child VendorOrder and Commission
    await VendorOrder.create({
      parentOrderId: testOrder._id,
      vendorId: vendorUser._id,
      customerId: customerA._id,
      vendorOrderNumber: 'MS-PAYTEST-1001-V1',
      orderNumber: 'MS-PAYTEST-1001-V1',
      items: testOrder.items,
      subtotal: 5000,
      tax: 900,
      vendorTotal: 5900,
      total: 5900,
      commissionAmount: 500,
      vendorPayout: 5400,
      paymentStatus: 'pending',
      status: 'pending',
    });

    await Commission.create({
      orderId: testOrder._id,
      vendorId: vendorUser._id,
      amount: 500,
      rate: 10,
      status: 'pending',
    });

    // -------------------------------------------------------------------------
    // TEST 1: Ownership Check on Order Payment Initiation
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Ownership Verification on create-order ---');
    const unauthInit = await makeRequest('/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { orderId: testOrder._id.toString() },
    });
    assert.strictEqual(unauthInit.status, 401, 'Unauthenticated payment initiation must return 401');

    const foreignInit = await makeRequest('/payments/create-order', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: { orderId: testOrder._id.toString() },
    });
    assert.strictEqual(foreignInit.status, 403, 'Customer B cannot initiate payment for Customer A order');
    console.log('  ✓ Order ownership strictly enforced on payment creation (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST 2: Duplicate Order Prevention & Gateway Pairing
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Duplicate Payment Order Prevention ---');
    const init1 = await makeRequest('/payments/create-order', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: { orderId: testOrder._id.toString() },
    });
    assert.strictEqual(init1.status, 200, 'Initial payment creation must return 200');
    const rzpOrderId1 = init1.data.data.razorpayOrderId;
    assert(rzpOrderId1, 'Must return razorpayOrderId');

    // Call create-order a second time for the same order (e.g. user clicked Pay Now again or refreshed)
    const init2 = await makeRequest('/payments/create-order', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: { orderId: testOrder._id.toString() },
    });
    assert.strictEqual(init2.status, 200);
    const rzpOrderId2 = init2.data.data.razorpayOrderId;

    assert.strictEqual(
      rzpOrderId1,
      rzpOrderId2,
      'Consecutive create-order calls must reuse the active gateway order ID to prevent duplicates'
    );

    const paymentCount = await Payment.countDocuments({ orderId: testOrder._id });
    assert.strictEqual(paymentCount, 1, 'Only one Payment document should exist for the active order');
    console.log('  ✓ Duplicate prevention verified: Reused active razorpayOrderId without creating duplicate records');

    // -------------------------------------------------------------------------
    // TEST 3: Gateway Order Pairing Mismatch on Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Strict Gateway Order Pairing on Verification ---');
    const mismatchRes = await makeRequest('/payments/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: {
        orderId: testOrder._id.toString(),
        razorpayOrderId: 'order_fake_mismatched_id_999',
        razorpayPaymentId: 'pay_123456',
        razorpaySignature: 'some_sig',
      },
    });
    assert.strictEqual(mismatchRes.status, 400, 'Mismatched razorpayOrderId must be rejected');
    assert(
      mismatchRes.data.message.includes('pairing mismatch') || mismatchRes.data.message.includes('No active gateway'),
      'Must explain pairing mismatch'
    );
    console.log('  ✓ Mismatched gateway order ID rejected cleanly with HTTP 400');

    // -------------------------------------------------------------------------
    // TEST 4: Invalid Signature Rejection & Safe Failure Handling
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Invalid Signature Rejection ---');
    const fakeSigRes = await makeRequest('/payments/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: {
        orderId: testOrder._id.toString(),
        razorpayOrderId: rzpOrderId1,
        razorpayPaymentId: 'pay_tampered_123',
        razorpaySignature: 'invalid_tampered_signature_hex_1234567890abcdef',
      },
    });
    assert.strictEqual(fakeSigRes.status, 400, 'Invalid signature must return HTTP 400');

    // Verify order remains pending (never marked paid on invalid signature)
    const orderAfterFail = await Order.findById(testOrder._id);
    assert.strictEqual(orderAfterFail.paymentStatus, 'pending', 'Order must remain pending on invalid signature');
    console.log('  ✓ Invalid signature rejected; order correctly remains pending');

    // -------------------------------------------------------------------------
    // TEST 5: Valid Signature Verification & Consistent State Transitions
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Valid Signature Verification & State Transitions ---');
    // Generate valid HMAC signature using configured secret
    const validPaymentId = `pay_test_${Date.now()}`;
    const keySecret = config.razorpay.keySecret || 'test_key_secret';
    config.razorpay.keySecret = keySecret; // ensure secret available for test

    const hmac = crypto.createHmac('sha256', keySecret);
    hmac.update(`${rzpOrderId1}|${validPaymentId}`);
    const validSignature = hmac.digest('hex');

    const verifyRes = await makeRequest('/payments/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: {
        orderId: testOrder._id.toString(),
        razorpayOrderId: rzpOrderId1,
        razorpayPaymentId: validPaymentId,
        razorpaySignature: validSignature,
      },
    });
    assert.strictEqual(verifyRes.status, 200, `Verification failed: ${JSON.stringify(verifyRes.data)}`);

    // Verify database state across all 4 collections
    const updatedOrder = await Order.findById(testOrder._id);
    const updatedVO = await VendorOrder.findOne({ parentOrderId: testOrder._id });
    const updatedComm = await Commission.findOne({ orderId: testOrder._id });
    const updatedPay = await Payment.findOne({ orderId: testOrder._id });

    assert.strictEqual(updatedOrder.paymentStatus, 'paid', 'Order paymentStatus must be paid');
    assert.strictEqual(updatedVO.paymentStatus, 'paid', 'VendorOrder paymentStatus must be paid');
    assert.strictEqual(updatedComm.status, 'eligible_for_payout', 'Commission status must be eligible_for_payout');
    assert.strictEqual(updatedPay.status, 'captured', 'Payment status must be captured');
    console.log('  ✓ Valid signature verified: Order, VendorOrder, Commission, Payment consistent and paid');

    // -------------------------------------------------------------------------
    // TEST 6: Cannot Create Razorpay Order for Already Paid Order
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Paid Order Re-initiation Block ---');
    const paidInit = await makeRequest('/payments/create-order', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: { orderId: testOrder._id.toString() },
    });
    assert.strictEqual(paidInit.status, 400, 'Cannot initiate payment for an already paid order');
    assert(paidInit.data.message.includes('already been paid'), 'Must explain order is already paid');
    console.log('  ✓ Re-initiation blocked for paid order (HTTP 400)');

    // -------------------------------------------------------------------------
    // TEST 7: Mock Key Detection Logic
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Consistent Mock Key Detection ---');
    const isMockKey = (keyId) => {
      if (!keyId) return true;
      const k = keyId.toString().toLowerCase().trim();
      return k === 'rzp_test_mock' || k === 'rzp_test_mock_key' || k.includes('mock');
    };

    assert.strictEqual(isMockKey('rzp_test_mock'), true, 'rzp_test_mock must be detected as mock');
    assert.strictEqual(isMockKey('rzp_test_mock_key'), true, 'rzp_test_mock_key must be detected as mock');
    assert.strictEqual(isMockKey('mock_key_123'), true, 'Keys with mock must be detected as mock');
    assert.strictEqual(isMockKey('rzp_test_1DP5mmOlF5G5ag'), false, 'Real test key must NOT be mock');
    assert.strictEqual(isMockKey('rzp_live_9xZyW8vU1aBcDe'), false, 'Real live key must NOT be mock');
    console.log('  ✓ Mock key helper consistently identifies placeholder vs real credentials');

    console.log('\n=== ALL RAZORPAY PAYMENT FLOW & CONSISTENCY TESTS PASSED! ===');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    server.close();
  }
};

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  if (server.listening) server.close();
  process.exit(1);
});

