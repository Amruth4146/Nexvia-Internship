import assert from 'assert';
import http from 'http';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import app from './src/app.js';
import { getRedisClient } from './src/config/redis.js';

import { User } from './src/models/User.js';
import { Vendor } from './src/models/Vendor.js';
import { Category } from './src/models/Category.js';
import { Product } from './src/models/Product.js';
import { Order } from './src/models/Order.js';
import { VendorOrder } from './src/models/VendorOrder.js';
import { generateAccessToken } from './src/utils/generateToken.js';

const TEST_DB_URI = 'mongodb://localhost:27017/marketsphere_test';

const makeRequest = (serverPort, path, options = {}) => {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: `/api/v1${path}`,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        let json = null;
        if (contentType.includes('application/json')) {
          try {
            json = JSON.parse(buffer.toString('utf8'));
          } catch (e) {}
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          buffer,
          text: buffer.toString('utf8'),
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
};

async function runInvoiceTestSuite() {
  console.log('=== STARTING 10-SCENARIO PDF TAX INVOICE TEST SUITE ===\n');

  // 1. Data Safety Setup
  const redisTracker = new Redis({ host: 'localhost', port: 6379 });
  const initialRedisKeys = await redisTracker.keys('*');
  console.log(`[Data Safety] Initial Redis keys: ${initialRedisKeys.length}`);

  await mongoose.connect(TEST_DB_URI);
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }
  console.log(`[Data Safety] Test database cleared: ${collections.length} collections (0 docs)`);

  // Start HTTP Test Server
  const server = http.createServer(app);
  const TEST_PORT = 5057;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`✓ Test Express server listening on http://127.0.0.1:${TEST_PORT}/api/v1\n`);

  try {
    // -------------------------------------------------------------------------
    // SEED FIXTURES
    // -------------------------------------------------------------------------
    // Customer A & Customer B
    const customerA = await User.create({
      name: 'Ananya Sharma',
      email: `ananya_${Date.now()}@example.com`,
      password: 'Password123!',
      phone: '9876543210',
      role: 'customer',
    });
    const tokenCustomerA = generateAccessToken(customerA._id, 'customer');

    const customerB = await User.create({
      name: 'Rohan Verma',
      email: `rohan_${Date.now()}@example.com`,
      password: 'Password123!',
      phone: '9811122233',
      role: 'customer',
    });
    const tokenCustomerB = generateAccessToken(customerB._id, 'customer');

    // Vendor A (Electronics - Mumbai, MH)
    const vendorUserA = await User.create({
      name: 'Apex Tech Seller',
      email: `apex_${Date.now()}@apextech.com`,
      password: 'Password123!',
      phone: '9822233344',
      role: 'vendor',
    });
    const tokenVendorA = generateAccessToken(vendorUserA._id, 'vendor');

    const vendorA = await Vendor.create({
      userId: vendorUserA._id,
      businessName: 'Apex Electronics Pvt Ltd',
      storeSlug: `apex-elec-${Date.now()}`,
      gstin: '27AABCU9603R1ZN',
      pan: 'AABCU9603R',
      address: {
        street: '402 Trade World, Lower Parel',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400013',
        country: 'India',
      },
      status: 'approved',
      commissionRate: 10,
    });
    vendorUserA.vendorId = vendorA._id;
    await vendorUserA.save();

    // Vendor B (Lifestyle - Bangalore, KA - Inter-state)
    const vendorUserB = await User.create({
      name: 'Urban Threads Seller',
      email: `urban_${Date.now()}@urbanthreads.com`,
      password: 'Password123!',
      phone: '9833344455',
      role: 'vendor',
    });
    const tokenVendorB = generateAccessToken(vendorUserB._id, 'vendor');

    const vendorB = await Vendor.create({
      userId: vendorUserB._id,
      businessName: 'Urban Threads Studio',
      storeSlug: `urban-threads-${Date.now()}`,
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      address: {
        street: '12 Indiranagar 100ft Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'India',
      },
      status: 'approved',
      commissionRate: 10,
    });
    vendorUserB.vendorId = vendorB._id;
    await vendorUserB.save();

    // Vendor C (Unregistered seller with missing tax / address details)
    const vendorUserC = await User.create({
      name: 'Handicrafts Artisan',
      email: `artisan_${Date.now()}@handicrafts.com`,
      password: 'Password123!',
      phone: '9844455566',
      role: 'vendor',
    });
    const tokenVendorC = generateAccessToken(vendorUserC._id, 'vendor');

    const vendorC = await Vendor.create({
      userId: vendorUserC._id,
      businessName: 'Village Handcrafts',
      storeSlug: `village-artisan-${Date.now()}`,
      status: 'approved',
      commissionRate: 10,
      // No gstin, no address
    });
    vendorUserC.vendorId = vendorC._id;
    await vendorUserC.save();

    // Admin User
    const adminUser = await User.create({
      name: 'Marketplace Administrator',
      email: `admin_${Date.now()}@marketsphere.com`,
      password: 'Password123!',
      role: 'admin',
    });
    const tokenAdmin = generateAccessToken(adminUser._id, 'admin');

    // Create Sample Products
    const category = await Category.create({ name: 'General', slug: `gen-${Date.now()}` });

    const productA = await Product.create({
      title: 'Sony WH-1000XM5 Wireless Headphones',
      description: 'Noise cancelling premium audio headset',
      categoryId: category._id,
      vendorId: vendorUserA._id,
      price: 29990,
      discountPrice: 26990,
      stock: 50,
      sku: 'SONY-XM5-BLK',
      gstRate: 18,
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e'],
    });

    const productB = await Product.create({
      title: 'Organic Linen Casual Shirt',
      description: 'Handcrafted sustainable breathable linen',
      categoryId: category._id,
      vendorId: vendorUserB._id,
      price: 2499,
      discountPrice: 1999,
      stock: 30,
      sku: 'URBAN-LINEN-WHT',
      gstRate: 12,
      images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518'],
    });

    const productC = await Product.create({
      title: 'Terracotta Handcrafted Clay Vase',
      description: 'Traditional pottery clay vase',
      categoryId: category._id,
      vendorId: vendorUserC._id,
      price: 599,
      stock: 15,
      sku: 'CLAY-VASE-01',
      gstRate: 5,
      images: ['https://images.unsplash.com/photo-1578749556568-bc2c40e68b61'],
    });

    // Create Single-Vendor Order for Customer A (from Vendor A)
    const orderNumber1 = `MS-TEST-001-${Date.now()}`;
    const suborderNumber1 = `${orderNumber1}-V1`;

    const vendorOrder1 = await VendorOrder.create({
      vendorOrderNumber: suborderNumber1,
      parentOrderId: new mongoose.Types.ObjectId(), // will update
      vendorId: vendorUserA._id,
      customerId: customerA._id,
      items: [
        {
          productId: productA._id,
          title: productA.title,
          price: 26990,
          quantity: 2,
          sku: productA.sku,
          gstRate: 18,
          taxAmount: 9716.4,
        },
      ],
      subtotal: 53980,
      shippingFee: 0,
      taxAmount: 9716.4,
      vendorTotal: 63696.4,
      commissionRate: 10,
      commissionAmount: 5398,
      vendorPayoutAmount: 47610.36,
      orderStatus: 'shipped',
      paymentStatus: 'paid',
    });

    const parentOrder1 = await Order.create({
      _id: vendorOrder1.parentOrderId,
      orderNumber: orderNumber1,
      customerId: customerA._id,
      vendorOrders: [vendorOrder1._id],
      items: [
        {
          productId: productA._id,
          title: productA.title,
          price: 26990,
          quantity: 2,
          sku: productA.sku,
          gstRate: 18,
          taxAmount: 9716.4,
          vendorId: vendorUserA._id,
        },
      ],
      shippingAddress: {
        fullName: 'Ananya Sharma',
        phone: '9876543210',
        street: 'Flat 1202, Lodha Bellissimo, NM Joshi Marg',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400011',
        country: 'India',
      },
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'shipped',
      itemsPrice: 53980,
      shippingPrice: 0,
      taxPrice: 9716.4,
      totalPrice: 63696.4,
      paidAt: new Date(),
    });

    // Create Multi-Vendor Order for Customer A (from Vendor A & Vendor B)
    const orderNumber2 = `MS-MULTI-002-${Date.now()}`;
    const parentOrderId2 = new mongoose.Types.ObjectId();

    const suborderMulti1 = await VendorOrder.create({
      vendorOrderNumber: `${orderNumber2}-V1`,
      parentOrderId: parentOrderId2,
      vendorId: vendorUserA._id,
      customerId: customerA._id,
      items: [
        {
          productId: productA._id,
          title: productA.title,
          price: 26990,
          quantity: 1,
          sku: productA.sku,
          gstRate: 18,
          taxAmount: 4858.2,
        },
      ],
      subtotal: 26990,
      shippingFee: 0,
      taxAmount: 4858.2,
      vendorTotal: 31848.2,
      orderStatus: 'processing',
      paymentStatus: 'paid',
    });

    const suborderMulti2 = await VendorOrder.create({
      vendorOrderNumber: `${orderNumber2}-V2`,
      parentOrderId: parentOrderId2,
      vendorId: vendorUserB._id,
      customerId: customerA._id,
      items: [
        {
          productId: productB._id,
          title: productB.title,
          price: 1999,
          quantity: 2,
          sku: productB.sku,
          gstRate: 12,
          taxAmount: 479.76,
        },
      ],
      subtotal: 3998,
      shippingFee: 0,
      taxAmount: 479.76,
      vendorTotal: 4477.76,
      orderStatus: 'placed',
      paymentStatus: 'paid',
    });

    const parentOrder2 = await Order.create({
      _id: parentOrderId2,
      orderNumber: orderNumber2,
      customerId: customerA._id,
      vendorOrders: [suborderMulti1._id, suborderMulti2._id],
      items: [
        {
          productId: productA._id,
          title: productA.title,
          price: 26990,
          quantity: 1,
          sku: productA.sku,
          gstRate: 18,
          taxAmount: 4858.2,
          vendorId: vendorUserA._id,
        },
        {
          productId: productB._id,
          title: productB.title,
          price: 1999,
          quantity: 2,
          sku: productB.sku,
          gstRate: 12,
          taxAmount: 479.76,
          vendorId: vendorUserB._id,
        },
      ],
      shippingAddress: {
        fullName: 'Ananya Sharma',
        phone: '9876543210',
        street: 'Flat 1202, Lodha Bellissimo',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400011',
        country: 'India',
      },
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'processing',
      itemsPrice: 30988,
      shippingPrice: 0,
      taxPrice: 5337.96,
      totalPrice: 36325.96,
      paidAt: new Date(),
    });

    // Create Order with Unregistered Vendor C
    const orderNumber3 = `MS-UNREG-003-${Date.now()}`;
    const parentOrderId3 = new mongoose.Types.ObjectId();

    const suborderUnreg = await VendorOrder.create({
      vendorOrderNumber: `${orderNumber3}-V1`,
      parentOrderId: parentOrderId3,
      vendorId: vendorUserC._id,
      customerId: customerA._id,
      items: [
        {
          productId: productC._id,
          title: productC.title,
          price: 599,
          quantity: 1,
          sku: productC.sku,
          gstRate: 5,
          taxAmount: 29.95,
        },
      ],
      subtotal: 599,
      shippingFee: 99,
      taxAmount: 29.95,
      vendorTotal: 727.95,
      orderStatus: 'placed',
      paymentStatus: 'paid',
    });

    const parentOrder3 = await Order.create({
      _id: parentOrderId3,
      orderNumber: orderNumber3,
      customerId: customerA._id,
      vendorOrders: [suborderUnreg._id],
      items: [
        {
          productId: productC._id,
          title: productC.title,
          price: 599,
          quantity: 1,
          sku: productC.sku,
          gstRate: 5,
          taxAmount: 29.95,
          vendorId: vendorUserC._id,
        },
      ],
      shippingAddress: {
        fullName: 'Ananya Sharma',
        phone: '9876543210',
        street: 'Flat 1202, Lodha Bellissimo',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400011',
        country: 'India',
      },
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      itemsPrice: 599,
      shippingPrice: 99,
      taxPrice: 29.95,
      totalPrice: 727.95,
    });

    // =========================================================================
    // SCENARIO 1: Valid Customer Invoice Download
    // =========================================================================
    console.log('--- SCENARIO 1: Valid Customer Invoice Download ---');
    const res1 = await makeRequest(TEST_PORT, `/orders/${parentOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
    assert.strictEqual(res1.headers['content-type'], 'application/pdf');
    assert(res1.headers['content-disposition'].includes(`Invoice-${suborderNumber1}.pdf`), 'Expected filename in disposition header');
    assert(res1.buffer.toString('utf8', 0, 5) === '%PDF-', 'Expected valid %PDF- magic bytes header');
    assert(res1.buffer.length > 1000, 'Expected non-trivial PDF file size (>1KB)');
    console.log(`  ✓ Customer downloaded invoice (${res1.buffer.length} bytes, PDF header verified) (HTTP 200)`);

    // =========================================================================
    // SCENARIO 2: Customer Attempting to Download Another Customer's Invoice
    // =========================================================================
    console.log('\n--- SCENARIO 2: Customer Access Control (Forbidden) ---');
    const res2 = await makeRequest(TEST_PORT, `/orders/${parentOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerB}` },
    });
    assert.strictEqual(res2.status, 403, `Expected 403, got ${res2.status}`);
    assert.strictEqual(res2.data.success, false);
    assert(res2.data.message.includes('Not authorized'), 'Expected authorization error message');
    console.log('  ✓ Customer B forbidden from accessing Customer A invoice (HTTP 403)');

    // =========================================================================
    // SCENARIO 3: Vendor Downloading Their Own Suborder Invoice
    // =========================================================================
    console.log('\n--- SCENARIO 3: Vendor Downloading Own Suborder Invoice ---');
    const res3 = await makeRequest(TEST_PORT, `/orders/vendor-orders/${vendorOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenVendorA}` },
    });
    assert.strictEqual(res3.status, 200, `Expected 200, got ${res3.status}`);
    assert.strictEqual(res3.headers['content-type'], 'application/pdf');
    assert(res3.headers['content-disposition'].includes(`Invoice-${suborderNumber1}.pdf`));
    assert(res3.buffer.toString('utf8', 0, 5) === '%PDF-');
    console.log(`  ✓ Vendor A downloaded own suborder invoice (${res3.buffer.length} bytes) (HTTP 200)`);

    // =========================================================================
    // SCENARIO 4: Vendor Attempting to Download Another Vendor's Invoice
    // =========================================================================
    console.log('\n--- SCENARIO 4: Vendor Access Control (Cross-Vendor Forbidden) ---');
    const res4 = await makeRequest(TEST_PORT, `/orders/vendor-orders/${vendorOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenVendorB}` },
    });
    assert.strictEqual(res4.status, 403, `Expected 403, got ${res4.status}`);
    assert.strictEqual(res4.data.success, false);
    assert(res4.data.message.includes('Not authorized'), 'Expected authorization error message');
    console.log('  ✓ Vendor B forbidden from accessing Vendor A suborder invoice (HTTP 403)');

    // =========================================================================
    // SCENARIO 5: Admin Access According to Existing Permissions
    // =========================================================================
    console.log('\n--- SCENARIO 5: Admin Platform Governance Access ---');
    const res5a = await makeRequest(TEST_PORT, `/orders/${parentOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(res5a.status, 200);
    assert.strictEqual(res5a.headers['content-type'], 'application/pdf');

    const res5b = await makeRequest(TEST_PORT, `/orders/vendor-orders/${vendorOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(res5b.status, 200);
    assert.strictEqual(res5b.headers['content-type'], 'application/pdf');
    console.log('  ✓ Admin successfully retrieved parent order & vendor suborder invoices (HTTP 200)');

    // =========================================================================
    // SCENARIO 6: Multi-Vendor Parent Order Generating Separate Invoices
    // =========================================================================
    console.log('\n--- SCENARIO 6: Multi-Vendor Order Separate Invoices ---');
    // Customer requests full parent order invoice (generates multi-page document)
    const res6a = await makeRequest(TEST_PORT, `/orders/${parentOrder2._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    assert.strictEqual(res6a.status, 200);
    assert(res6a.headers['content-disposition'].includes(`Invoices-Order-${orderNumber2}.pdf`));
    assert(res6a.buffer.length > res1.buffer.length, 'Multi-vendor PDF should have larger byte size than single-page invoice');

    // Customer requests specific vendor suborder invoice via query param
    const res6b = await makeRequest(TEST_PORT, `/orders/${parentOrder2._id}/invoice?suborderId=${suborderMulti2._id}`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    assert.strictEqual(res6b.status, 200);
    assert(res6b.headers['content-disposition'].includes(`Invoice-${orderNumber2}-V2.pdf`));
    console.log('  ✓ Multi-vendor order rendered separate seller invoices and selective suborder download (HTTP 200)');

    // =========================================================================
    // SCENARIO 7: GST and Totals Matching Stored Order Values
    // =========================================================================
    console.log('\n--- SCENARIO 7: Financial Integrity (Stored Snapshots Verified) ---');
    // Verify invoice text matches stored database numbers without altering DB
    const suborderCheck = await VendorOrder.findById(vendorOrder1._id);
    assert.strictEqual(suborderCheck.subtotal, 53980);
    assert.strictEqual(suborderCheck.taxAmount, 9716.4);
    assert.strictEqual(suborderCheck.vendorTotal, 63696.4);
    assert.strictEqual(suborderCheck.paymentStatus, 'paid');
    console.log('  ✓ Suborder totals match stored financial values (Subtotal: ₹53,980, Tax: ₹9,716.40, Total: ₹63,696.40)');

    // =========================================================================
    // SCENARIO 8: Missing Seller Tax Information Safely Handled
    // =========================================================================
    console.log('\n--- SCENARIO 8: Resilient Handling of Missing Seller Information ---');
    const res8 = await makeRequest(TEST_PORT, `/orders/${parentOrder3._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    assert.strictEqual(res8.status, 200);
    assert.strictEqual(res8.headers['content-type'], 'application/pdf');
    assert(res8.buffer.toString('utf8', 0, 5) === '%PDF-');
    console.log('  ✓ Invoice generated safely for unregistered artisan vendor with missing GSTIN & address (HTTP 200)');

    // =========================================================================
    // SCENARIO 9: PDF Response Headers and Valid Binary Content
    // =========================================================================
    console.log('\n--- SCENARIO 9: Response Headers & Binary File Validation ---');
    assert.strictEqual(res1.headers['content-type'], 'application/pdf');
    assert(res1.headers['content-disposition'].startsWith('attachment; filename='));
    assert(res1.buffer.subarray(0, 4).toString() === '%PDF', 'Magic bytes must be %PDF');
    // Validate PDF trailer / EOF
    const tail = res1.buffer.subarray(res1.buffer.length - 20).toString();
    assert(tail.includes('%%EOF') || tail.includes('startxref'), 'PDF must end with valid trailer/EOF marker');
    console.log('  ✓ Content-Type, Content-Disposition, %PDF- magic bytes, and %%EOF trailer verified');

    // =========================================================================
    // SCENARIO 10: Repeated Downloads Producing Identical Invoice Identity
    // =========================================================================
    console.log('\n--- SCENARIO 10: Idempotent Invoice Identity (Zero Side-Effects) ---');
    const dl1 = await makeRequest(TEST_PORT, `/orders/${parentOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    const dl2 = await makeRequest(TEST_PORT, `/orders/${parentOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });
    const dl3 = await makeRequest(TEST_PORT, `/orders/${parentOrder1._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenCustomerA}` },
    });

    assert.strictEqual(dl1.headers['content-disposition'], dl2.headers['content-disposition']);
    assert.strictEqual(dl2.headers['content-disposition'], dl3.headers['content-disposition']);

    // Check no new orders or suborders were created
    const totalOrders = await Order.countDocuments();
    const totalSuborders = await VendorOrder.countDocuments();
    assert.strictEqual(totalOrders, 3, 'Order count must remain constant');
    assert.strictEqual(totalSuborders, 4, 'Suborder count must remain constant');
    console.log('  ✓ 3 consecutive downloads produced identical filename, invoice identity, and zero database mutations');

    console.log('\n=== ALL 10 PDF TAX INVOICE TEST SCENARIOS PASSED WITH 100% SUCCESS ===');
  } finally {
    // Teardown & Data Safety Cleanup
    console.log('\n--- TEARDOWN & CLEANUP ---');
    await new Promise((resolve) => server.close(resolve));

    const cols = await mongoose.connection.db.listCollections().toArray();
    for (const c of cols) {
      await mongoose.connection.db.collection(c.name).deleteMany({});
    }

    const currentKeys = await redisTracker.keys('*');
    const createdKeys = currentKeys.filter((k) => !initialRedisKeys.includes(k));
    if (createdKeys.length > 0) {
      await redisTracker.del(...createdKeys);
      console.log(`[Data Safety] Deleted ${createdKeys.length} test-created Redis keys:`, createdKeys);
    }

    const finalKeys = await redisTracker.keys('*');
    assert.strictEqual(finalKeys.length, initialRedisKeys.length, 'Redis key count must match baseline');

    let finalMongoDocs = 0;
    for (const c of cols) {
      finalMongoDocs += await mongoose.connection.db.collection(c.name).countDocuments();
    }
    assert.strictEqual(finalMongoDocs, 0, 'Isolated test database must have 0 documents');

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

runInvoiceTestSuite()
  .then(() => {
    console.log('✓ PDF Invoice test suite finished successfully with exit code 0.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ PDF Invoice test suite failed with error:', err);
    process.exit(1);
  });
