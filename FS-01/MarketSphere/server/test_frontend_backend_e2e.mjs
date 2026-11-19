import assert from 'assert';
import crypto from 'crypto';
import http from 'http';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import app from './src/app.js';
import { config } from './src/config/env.js';
import { getRedisClient } from './src/config/redis.js';

import { User } from './src/models/User.js';
import { Category } from './src/models/Category.js';
import { Product } from './src/models/Product.js';
import { Order } from './src/models/Order.js';
import { VendorOrder } from './src/models/VendorOrder.js';
import { Payment } from './src/models/Payment.js';
import { Commission } from './src/models/Commission.js';
import { Cart } from './src/models/Cart.js';
import { Address } from './src/models/Address.js';

const TEST_DB_URI = 'mongodb://localhost:27017/marketsphere_test';
const TEST_KEY_SECRET = 'test_secret_e2e_frontend_backend';
config.razorpay.keySecret = TEST_KEY_SECRET;
config.razorpay.webhookSecret = TEST_KEY_SECRET;

const generateSignature = (orderId, paymentId) => {
  return crypto
    .createHmac('sha256', TEST_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
};

const makeRequest = (serverPort, path, options = {}) => {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: `/api/v1${path}`,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
};

async function runE2ETests() {
  console.log('=== STARTING COMPLETE FRONTEND-TO-BACKEND INTEGRATION E2E TEST ===\n');

  // Connect Redis tracker and record initial keys
  const redisTracker = new Redis({ host: 'localhost', port: 6379 });
  const initialRedisKeys = await redisTracker.keys('*');
  console.log(`[Data Safety] Initial Redis keys count: ${initialRedisKeys.length}`, initialRedisKeys);

  // Connect isolated test DB and record initial document counts
  await mongoose.connect(TEST_DB_URI);
  const collections = await mongoose.connection.db.listCollections().toArray();
  let initialMongoDocs = 0;
  for (const c of collections) {
    const count = await mongoose.connection.db.collection(c.name).countDocuments();
    initialMongoDocs += count;
  }
  console.log(`[Data Safety] Initial MongoDB collections: ${collections.length}, initial documents: ${initialMongoDocs}`);

  // Clean initial test database state
  for (const c of collections) {
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }

  // Start HTTP test server on port 5055
  const server = http.createServer(app);
  const TEST_PORT = 5055;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`✓ Test Express server listening on http://127.0.0.1:${TEST_PORT}/api/v1\n`);

  try {
    // =========================================================================
    // WORKFLOW 1: Customer & Vendor Registration, Login, Session, Token Refresh
    // =========================================================================
    console.log('--- WORKFLOW 1: Authentication & Session Handling ---');

    // 1A. Customer Registration
    const custEmail = `alex_${Date.now()}@example.com`;
    const regCustRes = await makeRequest(TEST_PORT, '/auth/register', {
      method: 'POST',
      body: {
        name: 'Alex Sharma',
        email: custEmail,
        password: 'Password123!',
        phone: '9876543210',
        role: 'customer',
      },
    });
    assert.strictEqual(regCustRes.status, 201, `Customer register failed: ${JSON.stringify(regCustRes.data)}`);
    assert(regCustRes.data.data.token, 'Customer access token missing');
    const customerToken = regCustRes.data.data.token;
    console.log('  ✓ Customer registration succeeded (HTTP 201)');

    // 1B. Customer Login
    const loginCustRes = await makeRequest(TEST_PORT, '/auth/login', {
      method: 'POST',
      body: { email: custEmail, password: 'Password123!' },
    });
    assert.strictEqual(loginCustRes.status, 200, 'Customer login failed');
    assert.strictEqual(loginCustRes.data.data.user.email, custEmail);
    console.log('  ✓ Customer login succeeded (HTTP 200)');

    // 1C. Session Verification (/auth/me)
    const meRes = await makeRequest(TEST_PORT, '/auth/me', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(meRes.status, 200, 'Session verification failed');
    assert.strictEqual(meRes.data.data.user.role, 'customer');
    console.log('  ✓ Session retrieval (/auth/me) verified (HTTP 200)');

    // 1D. Vendor Registration
    const vendorEmail = `vendor_${Date.now()}@apextech.com`;
    const regVendorRes = await makeRequest(TEST_PORT, '/auth/register', {
      method: 'POST',
      body: {
        name: 'Apex Tech Electronics',
        email: vendorEmail,
        password: 'Password123!',
        phone: '9812345678',
        role: 'vendor',
        businessName: 'Apex Electronics Pvt Ltd',
      },
    });
    assert.strictEqual(regVendorRes.status, 201, 'Vendor register failed');
    assert(regVendorRes.data.data.token, 'Vendor access token missing');
    const vendorToken = regVendorRes.data.data.token;
    const vendorUserId = regVendorRes.data.data.user.id;
    console.log('  ✓ Vendor registration & onboarding succeeded (HTTP 201)');

    // 1E. Admin Registration / Verification
    const adminEmail = `admin_${Date.now()}@marketsphere.com`;
    const adminUser = await User.create({
      name: 'System Admin',
      email: adminEmail,
      password: 'Password123!',
      role: 'admin',
    });
    const loginAdminRes = await makeRequest(TEST_PORT, '/auth/login', {
      method: 'POST',
      body: { email: adminEmail, password: 'Password123!' },
    });
    assert.strictEqual(loginAdminRes.status, 200, 'Admin login failed');
    assert.strictEqual(loginAdminRes.data.data.user.role, 'admin');
    const adminToken = loginAdminRes.data.data.token;
    console.log('  ✓ Admin authentication verified (HTTP 200)');

    // =========================================================================
    // WORKFLOW 2: Product Listing, Search, Filtering and Product Details
    // =========================================================================
    console.log('\n--- WORKFLOW 2: Product Listing, Search & Details ---');

    // 2A. Create Category
    const category = await Category.create({
      name: 'Consumer Electronics',
      slug: `electronics-${Date.now()}`,
    });

    // 2B. Vendor Creates Product
    const newProdRes = await makeRequest(TEST_PORT, '/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${vendorToken}` },
      body: {
        title: 'Sony WH-1000XM5 Wireless Headphones',
        description: 'Industry-leading noise canceling with dual processors and exceptional audio fidelity.',
        categoryId: category._id.toString(),
        price: 29990,
        discountPrice: 26990,
        stock: 45,
        sku: `SONY-XM5-${Date.now()}`,
        brand: 'Sony',
        images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'],
        isFeatured: true,
      },
    });
    assert.strictEqual(newProdRes.status, 201, `Create product failed: ${JSON.stringify(newProdRes.data)}`);
    const createdProduct = newProdRes.data.data.product || newProdRes.data.data;
    const productId = createdProduct._id;
    console.log('  ✓ Vendor product listing published (HTTP 201)');

    // 2C. Catalog Listing & Search
    const listRes = await makeRequest(TEST_PORT, `/products?keyword=Sony&minPrice=20000&maxPrice=30000`);
    assert.strictEqual(listRes.status, 200);
    assert(listRes.data.data.products.length >= 1, 'Expected at least 1 product found');
    console.log(`  ✓ Search & filtering returned ${listRes.data.data.products.length} products (HTTP 200)`);

    // 2D. Product Details
    const detailRes = await makeRequest(TEST_PORT, `/products/${createdProduct.slug || productId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.data.data.product.title, 'Sony WH-1000XM5 Wireless Headphones');
    console.log('  ✓ Product detail retrieval verified (HTTP 200)');

    // =========================================================================
    // WORKFLOW 3: Cart Operations & Persistent Cart Synchronization
    // =========================================================================
    console.log('\n--- WORKFLOW 3: Cart Operations & Persistent DB Sync ---');

    // 3A. Add item to cart
    const addCartRes = await makeRequest(TEST_PORT, '/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { productId, quantity: 2 },
    });
    assert.strictEqual(addCartRes.status, 200, `Add to cart failed: ${JSON.stringify(addCartRes.data)}`);
    console.log('  ✓ Add item to cart succeeded (HTTP 200)');

    // 3B. Get persistent cart
    const getCartRes = await makeRequest(TEST_PORT, '/cart', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(getCartRes.status, 200);
    assert.strictEqual(getCartRes.data.data.items.length, 1);
    assert.strictEqual(getCartRes.data.data.items[0].quantity, 2);
    console.log('  ✓ Persistent cart retrieval verified with totals (HTTP 200)');

    // 3C. Update quantity in cart
    const updateCartRes = await makeRequest(TEST_PORT, `/cart/items/${productId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { quantity: 1 },
    });
    assert.strictEqual(updateCartRes.status, 200);
    assert.strictEqual(updateCartRes.data.data.items[0].quantity, 1);
    console.log('  ✓ Cart quantity update verified (HTTP 200)');

    // =========================================================================
    // WORKFLOW 4: Customer Address Management & Order Creation (Checkout)
    // =========================================================================
    console.log('\n--- WORKFLOW 4: Address Management & Order Creation ---');

    // 4A. Add customer address
    const addAddrRes = await makeRequest(TEST_PORT, '/users/addresses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        fullName: 'Alex Sharma',
        phone: '9876543210',
        street: 'Flat 402, Trade Tower, Lower Parel',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400013',
        country: 'India',
        addressType: 'home',
        isDefault: true,
      },
    });
    assert.strictEqual(addAddrRes.status, 201, `Add address failed: ${JSON.stringify(addAddrRes.data)}`);
    const savedAddress = addAddrRes.data.data;
    console.log('  ✓ Customer saved address created (HTTP 201)');

    // 4B. Fetch saved addresses
    const getAddrRes = await makeRequest(TEST_PORT, '/users/addresses', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(getAddrRes.status, 200);
    assert(getAddrRes.data.data.length >= 1, 'Expected at least 1 saved address');
    console.log('  ✓ Customer saved address retrieval verified (HTTP 200)');

    // 4C. Checkout: Place Order with Idempotency Key
    const idempotencyKey = `e2e_idemp_${Date.now()}`;
    const orderPayload = {
      items: [{ productId, quantity: 1 }],
      shippingAddress: {
        fullName: savedAddress.fullName,
        phone: savedAddress.phone,
        street: savedAddress.street,
        city: savedAddress.city,
        state: savedAddress.state,
        postalCode: savedAddress.postalCode,
        country: savedAddress.country,
      },
      paymentMethod: 'razorpay',
    };

    const createOrderRes = await makeRequest(TEST_PORT, '/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: orderPayload,
    });
    assert.strictEqual(createOrderRes.status, 201, `Create order failed: ${JSON.stringify(createOrderRes.data)}`);
    const createdOrder = createOrderRes.data.data;
    const orderId = createdOrder._id;

    // Verify order created with paymentStatus: 'pending' (Requirement from Phase 4N)
    assert.strictEqual(createdOrder.paymentStatus, 'pending', 'Order must be initialized with pending payment');
    console.log(`  ✓ Order #${createdOrder.orderNumber} created with paymentStatus: pending (HTTP 201)`);

    // =========================================================================
    // WORKFLOW 5: Razorpay Payment Initiation & Verification
    // =========================================================================
    console.log('\n--- WORKFLOW 5: Razorpay Payment Initiation & Verification ---');

    // 5A. Initiate Payment Gateway Order
    const initPayRes = await makeRequest(TEST_PORT, '/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { orderId },
    });
    assert.strictEqual(initPayRes.status, 200, `Payment initiation failed: ${JSON.stringify(initPayRes.data)}`);
    const rzpData = initPayRes.data.data;
    assert(rzpData.razorpayOrderId, 'Expected razorpayOrderId returned');
    console.log(`  ✓ Razorpay order created (${rzpData.razorpayOrderId}) (HTTP 200)`);

    // 5B. Verify Payment with HMAC signature
    const rzpPaymentId = `pay_e2e_${Date.now()}`;
    const validSignature = generateSignature(rzpData.razorpayOrderId, rzpPaymentId);

    const verifyPayRes = await makeRequest(TEST_PORT, '/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        orderId,
        razorpayOrderId: rzpData.razorpayOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: validSignature,
      },
    });
    assert.strictEqual(verifyPayRes.status, 200, `Payment verification failed: ${JSON.stringify(verifyPayRes.data)}`);
    console.log('  ✓ Payment verified and captured successfully (HTTP 200)');

    // 5C. Verify Database Consistency
    const dbOrder = await Order.findById(orderId);
    const dbVO = await VendorOrder.findOne({ parentOrderId: orderId });
    const dbComm = await Commission.findOne({ orderId });
    const dbPayment = await Payment.findOne({ orderId });

    assert.strictEqual(dbOrder.paymentStatus, 'paid', 'Order paymentStatus must be paid');
    assert.strictEqual(dbVO.paymentStatus, 'paid', 'VendorOrder paymentStatus must be paid');
    assert.strictEqual(dbComm.status, 'eligible_for_payout', 'Commission status must be eligible_for_payout');
    assert.strictEqual(dbPayment.status, 'captured', 'Payment status must be captured');
    console.log('  ✓ Full database financial state transition verified: Order, VendorOrder, Commission, Payment');

    // =========================================================================
    // WORKFLOW 6: Customer Order History & Order Details
    // =========================================================================
    console.log('\n--- WORKFLOW 6: Customer Order History & Details ---');

    const myOrdersRes = await makeRequest(TEST_PORT, '/orders/my', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(myOrdersRes.status, 200);
    assert(myOrdersRes.data.data.length >= 1, 'Expected order in customer history');
    assert.strictEqual(myOrdersRes.data.data[0].paymentStatus, 'paid');
    console.log(`  ✓ Customer order history retrieved (${myOrdersRes.data.data.length} order(s)) (HTTP 200)`);

    const orderDetailRes = await makeRequest(TEST_PORT, `/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(orderDetailRes.status, 200);
    assert.strictEqual(orderDetailRes.data.data._id, orderId);
    console.log('  ✓ Customer order details verified (HTTP 200)');

    // =========================================================================
    // WORKFLOW 7: Vendor Dashboard Live Metrics
    // =========================================================================
    console.log('\n--- WORKFLOW 7: Vendor Dashboard Live Metrics ---');

    const vendorMetricsRes = await makeRequest(TEST_PORT, '/vendors/dashboard/metrics', {
      headers: { Authorization: `Bearer ${vendorToken}` },
    });
    assert.strictEqual(vendorMetricsRes.status, 200, `Vendor metrics failed: ${JSON.stringify(vendorMetricsRes.data)}`);
    const vMetrics = vendorMetricsRes.data.data.metrics;
    assert(vMetrics.totalOrders >= 1, 'Expected at least 1 order in vendor metrics');
    assert(vMetrics.totalSalesINR > 0, 'Expected total sales > 0');
    assert(vMetrics.totalPayoutINR > 0, 'Expected total payout > 0');
    console.log(`  ✓ Vendor live metrics verified: Sales ₹${vMetrics.totalSalesINR}, Payout ₹${vMetrics.totalPayoutINR}, Orders ${vMetrics.totalOrders} (HTTP 200)`);

    // =========================================================================
    // WORKFLOW 8: Vendor Suborders & Fulfillment Order Management
    // =========================================================================
    console.log('\n--- WORKFLOW 8: Vendor Suborders & Fulfillment Management ---');

    const vendorOrdersRes = await makeRequest(TEST_PORT, '/orders/vendor', {
      headers: { Authorization: `Bearer ${vendorToken}` },
    });
    assert.strictEqual(vendorOrdersRes.status, 200);
    assert(vendorOrdersRes.data.data.length >= 1, 'Expected at least 1 vendor suborder');
    const vendorSuborder = vendorOrdersRes.data.data[0];
    console.log(`  ✓ Vendor retrieved suborders: ${vendorSuborder.vendorOrderNumber} (HTTP 200)`);

    // Vendor updates fulfillment status and courier tracking number
    const updateFulfillRes = await makeRequest(TEST_PORT, `/orders/vendor/${vendorSuborder._id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${vendorToken}` },
      body: {
        status: 'shipped',
        trackingNumber: 'DELHIVERY-IND-99887766',
      },
    });
    assert.strictEqual(updateFulfillRes.status, 200);
    assert.strictEqual(updateFulfillRes.data.data.orderStatus, 'shipped');
    assert.strictEqual(updateFulfillRes.data.data.trackingNumber, 'DELHIVERY-IND-99887766');
    console.log('  ✓ Vendor updated fulfillment to "shipped" with tracking DELHIVERY-IND-99887766 (HTTP 200)');

    // =========================================================================
    // WORKFLOW 9: Admin Console Governance (Users, Vendors, Orders, Commissions)
    // =========================================================================
    console.log('\n--- WORKFLOW 9: Admin Platform Governance ---');

    // 9A. Admin Dashboard Overview
    const adminDashRes = await makeRequest(TEST_PORT, '/admin/dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminDashRes.status, 200);
    const aMetrics = adminDashRes.data.data;
    assert(aMetrics.totalUsers >= 2, 'Expected total users >= 2');
    assert(aMetrics.totalOrders >= 1, 'Expected total orders >= 1');
    console.log(`  ✓ Admin dashboard metrics: GMV ₹${aMetrics.totalGMV_INR}, Commission ₹${aMetrics.totalPlatformCommission_INR} (HTTP 200)`);

    // 9B. Admin View All Orders
    const adminOrdersRes = await makeRequest(TEST_PORT, '/admin/orders', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminOrdersRes.status, 200);
    assert(adminOrdersRes.data.data.length >= 1, 'Expected orders in admin list');
    console.log(`  ✓ Admin retrieved all marketplace orders (${adminOrdersRes.data.data.length}) (HTTP 200)`);

    // 9C. Admin Commission Reports
    const adminCommRes = await makeRequest(TEST_PORT, '/admin/commissions', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminCommRes.status, 200);
    assert(adminCommRes.data.data.length >= 1, 'Expected commission records');
    console.log(`  ✓ Admin commission reports retrieved (${adminCommRes.data.data.length} records) (HTTP 200)`);

    // 9D. Admin Toggle User Status
    const userToggleRes = await makeRequest(TEST_PORT, `/users/${adminUser._id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { isActive: true },
    });
    assert.strictEqual(userToggleRes.status, 200);
    console.log('  ✓ Admin user management verified (HTTP 200)');

    // 9E. Admin Update Vendor Status
    const vendorRecord = await VendorOrder.findOne({ vendorId: vendorUserId });
    const vendorDoc = await User.findById(vendorUserId);
    const updateVendorStatusRes = await makeRequest(TEST_PORT, `/admin/vendors/${vendorDoc.vendorId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'approved', isVerified: true, commissionRate: 10 },
    });
    assert.strictEqual(updateVendorStatusRes.status, 200);
    console.log('  ✓ Admin vendor management verified (HTTP 200)');

    console.log('\n=== ALL 9 FRONTEND-TO-BACKEND WORKFLOWS PASSED WITH 100% SUCCESS ===');
  } finally {
    // Teardown
    console.log('\n--- TEARDOWN & CLEANUP ---');
    await new Promise((resolve) => server.close(resolve));

    // Clean test MongoDB documents
    const cols = await mongoose.connection.db.listCollections().toArray();
    for (const c of cols) {
      await mongoose.connection.db.collection(c.name).deleteMany({});
    }

    // Clean only Redis keys created during this test run (never flushall)
    const currentKeys = await redisTracker.keys('*');
    const createdKeys = currentKeys.filter((k) => !initialRedisKeys.includes(k));
    if (createdKeys.length > 0) {
      await redisTracker.del(...createdKeys);
      console.log(`[Data Safety] Safely deleted ${createdKeys.length} test-created Redis keys:`, createdKeys);
    }

    // Verify Redis cleanup
    const finalKeys = await redisTracker.keys('*');
    console.log(`[Data Safety] Final Redis keys count: ${finalKeys.length} (Matches initial baseline: ${initialRedisKeys.length})`);
    assert.strictEqual(finalKeys.length, initialRedisKeys.length, 'Redis key count must match baseline');

    // Verify MongoDB cleanup
    let finalMongoDocs = 0;
    for (const c of cols) {
      finalMongoDocs += await mongoose.connection.db.collection(c.name).countDocuments();
    }
    console.log(`[Data Safety] Final MongoDB documents: ${finalMongoDocs} (isolated test database cleared)`);
    assert.strictEqual(finalMongoDocs, 0, 'Isolated test database must have 0 documents after test');

    await redisTracker.quit();
    const appRedis = getRedisClient();
    if (appRedis) {
      try {
        await appRedis.quit();
      } catch (e) {}
    }
    await mongoose.disconnect();
    console.log('✓ Test HTTP server closed, database cleaned (0 docs), Redis safely verified.\n');
  }
}

runE2ETests()
  .then(() => {
    console.log('✓ E2E integration test process finished with exit code 0.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ E2E integration test failed with error:', err);
    process.exit(1);
  });

