import assert from 'assert';
import mongoose from 'mongoose';
import http from 'http';
import { config } from './src/config/env.js';
import { getRedisClient, connectRedis } from './src/config/redis.js';
import { cacheService } from './src/services/cacheService.js';
import { User } from './src/models/User.js';
import { Product } from './src/models/Product.js';
import { Category } from './src/models/Category.js';
import { Cart } from './src/models/Cart.js';
import { Vendor } from './src/models/Vendor.js';
import app from './src/app.js';
import { generateAccessToken } from './src/utils/generateToken.js';

console.log('=== RUNNING COMPREHENSIVE REDIS-DISABLED VERIFICATION TEST ===\n');

const TEST_DB_URI = 'mongodb://localhost:27017/marketsphere_test_redis_disabled';

// Helper to make HTTP requests
const makeRequest = (port, path, options = {}) => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
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
          } catch (e) {}
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

async function runTest() {
  await mongoose.connect(TEST_DB_URI);
  console.log('âœ“ Connected to isolated test MongoDB');

  // Clear test DB
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }

  // -------------------------------------------------------------------------
  // 1. Startup & Client behavior with REDIS_ENABLED=false
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Testing Startup & Client when Redis is Disabled ---');
  config.redis.enabled = false;

  const clientWhenDisabled = getRedisClient();
  assert.strictEqual(clientWhenDisabled, null, 'getRedisClient() must return null when disabled');
  console.log('  âœ“ getRedisClient() returned null without creating connection');

  const connectResultDisabled = await connectRedis();
  assert.strictEqual(connectResultDisabled, null, 'connectRedis() must return null and skip connection');
  console.log('  âœ“ connectRedis() safely skipped connection and returned null');

  // Verify cacheService operations fail gracefully
  const cachedVal = await cacheService.get('test_key');
  assert.strictEqual(cachedVal, null, 'cacheService.get must return null when redis is disabled');
  const setVal = await cacheService.set('test_key', 'val');
  assert.strictEqual(setVal, false, 'cacheService.set must return false when redis is disabled');
  const delVal = await cacheService.del('test_key');
  assert.strictEqual(delVal, false, 'cacheService.del must return false when redis is disabled');
  console.log('  âœ“ cacheService gracefully handled get/set/del without throwing');

  // Start HTTP server with Redis disabled
  const server = http.createServer(app);
  const TEST_PORT = 5059;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`  âœ“ Test Express server listening on port ${TEST_PORT} with Redis disabled`);

  let clientWhenEnabled = null;
  try {
    // -------------------------------------------------------------------------
    // 2. Category Retrieval Without Redis
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Category Retrieval Without Redis ---');
    const categoryDoc = await Category.create({
      name: 'Electronics Test',
      slug: `electronics-test-${Date.now()}`,
      description: 'Test category description',
      isActive: true,
      displayOrder: 1,
    });

    const catRes = await makeRequest(TEST_PORT, '/categories');
    assert.strictEqual(catRes.status, 200, 'Categories endpoint must return 200');
    assert.strictEqual(catRes.data.source, 'database', 'Category source must be "database"');
    assert(catRes.data.data.some((c) => c._id === categoryDoc._id.toString()), 'Category must be present in response');
    console.log('  âœ“ Category retrieval succeeded from MongoDB database (source: database)');

    // -------------------------------------------------------------------------
    // 3. Product Retrieval Without Redis
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Product Retrieval Without Redis ---');
    const testVendorUser = await User.create({
      name: 'Vendor Redis Test',
      email: `vendor_redis_${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'vendor',
    });
    const testVendor = await Vendor.create({
      userId: testVendorUser._id,
      businessName: 'Test Redis Store Pvt Ltd',
      storeSlug: `test-redis-store-${Date.now()}`,
      status: 'approved',
      commissionRate: 10,
      address: {
        street: '123 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
    });

    const testProduct = await Product.create({
      title: 'Redis Disabled Wireless Headphones',
      description: 'High-end test headphones with noise cancelling',
      price: 24999,
      discountPrice: 21999,
      stock: 50,
      sku: `HEADPHONE-${Date.now()}`,
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e'],
      categoryId: categoryDoc._id,
      vendorId: testVendorUser._id,
      isFeatured: true,
      status: 'published',
      gstRate: 18,
    });

    const featRes = await makeRequest(TEST_PORT, '/products/featured');
    assert.strictEqual(featRes.status, 200, 'Featured products endpoint must return 200');
    assert.strictEqual(featRes.data.source, 'database', 'Product source must be "database"');
    assert(featRes.data.data.some((p) => p._id === testProduct._id.toString()), 'Featured product must be present');
    console.log('  âœ“ Featured product retrieval succeeded from MongoDB database (source: database)');

    // -------------------------------------------------------------------------
    // 4. Cart Operations Without Redis (CRUD & MongoDB Persistence)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Cart CRUD Operations Without Redis ---');
    const customerUser = await User.create({
      name: 'Cart Customer',
      email: `cart_customer_${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'customer',
    });
    const customerToken = generateAccessToken(customerUser._id, customerUser.role);
    const authHeaders = {
      Authorization: `Bearer ${customerToken}`,
      'Content-Type': 'application/json',
    };

    // A. Add to Cart (Create)
    const addRes = await makeRequest(TEST_PORT, '/cart/items', {
      method: 'POST',
      headers: authHeaders,
      body: { productId: testProduct._id.toString(), quantity: 2 },
    });
    assert.strictEqual(addRes.status, 200, `Add to cart failed: ${JSON.stringify(addRes.data)}`);
    assert.strictEqual(addRes.data.data.itemsCount, 2);
    assert.strictEqual(addRes.data.data.subtotal, 43998); // 21999 * 2
    console.log('  âœ“ 4A. Add to cart succeeded (HTTP 200)');

    // Verify MongoDB directly
    const dbCartAfterAdd = await Cart.findOne({ userId: customerUser._id });
    assert(dbCartAfterAdd, 'Cart must exist in MongoDB');
    assert.strictEqual(dbCartAfterAdd.items.length, 1, 'MongoDB Cart must contain 1 item');
    assert.strictEqual(dbCartAfterAdd.items[0].quantity, 2, 'MongoDB Cart item quantity must be 2');
    console.log('  âœ“ 4A (DB). Verified cart persisted directly into MongoDB document');

    // B. Get Cart (Read)
    const getRes = await makeRequest(TEST_PORT, '/cart', {
      method: 'GET',
      headers: authHeaders,
    });
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.data.data.items.length, 1);
    assert.strictEqual(getRes.data.data.items[0].quantity, 2);
    assert.strictEqual(getRes.data.data.totalPrice, 51917.64); // 43998 + 0 shipping + 7919.64 tax
    console.log('  âœ“ 4B. Get cart retrieved successfully from MongoDB (HTTP 200)');

    // C. Update Cart Item Quantity (Update)
    const updateRes = await makeRequest(TEST_PORT, `/cart/items/${testProduct._id.toString()}`, {
      method: 'PUT',
      headers: authHeaders,
      body: { quantity: 5 },
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.data.itemsCount, 5);
    console.log('  âœ“ 4C. Update cart quantity to 5 succeeded (HTTP 200)');

    // Verify MongoDB directly
    const dbCartAfterUpdate = await Cart.findOne({ userId: customerUser._id });
    assert.strictEqual(dbCartAfterUpdate.items[0].quantity, 5, 'MongoDB Cart item quantity must be updated to 5');
    console.log('  âœ“ 4C (DB). Verified updated quantity persisted in MongoDB');

    // D. Delete Single Item from Cart (Delete Item)
    const removeRes = await makeRequest(TEST_PORT, `/cart/items/${testProduct._id.toString()}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.strictEqual(removeRes.status, 200);
    assert.strictEqual(removeRes.data.data.items.length, 0);
    console.log('  âœ“ 4D. Remove cart item succeeded (HTTP 200)');

    const dbCartAfterRemove = await Cart.findOne({ userId: customerUser._id });
    assert.strictEqual(dbCartAfterRemove.items.length, 0, 'MongoDB Cart items must be empty after removal');
    console.log('  âœ“ 4D (DB). Verified item removal persisted in MongoDB');

    // Re-add and test Clear Cart
    await makeRequest(TEST_PORT, '/cart/items', {
      method: 'POST',
      headers: authHeaders,
      body: { productId: testProduct._id.toString(), quantity: 1 },
    });
    const clearRes = await makeRequest(TEST_PORT, '/cart', {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.strictEqual(clearRes.status, 200);
    assert.strictEqual(clearRes.data.data.itemsCount, 0);
    const dbCartAfterClear = await Cart.findOne({ userId: customerUser._id });
    assert.strictEqual(dbCartAfterClear.items.length, 0, 'MongoDB Cart items must be empty after clearCart');
    console.log('  âœ“ 4E. Clear cart verified in MongoDB (HTTP 200)');

    // -------------------------------------------------------------------------
    // 5. Test Client Instance Creation With Redis Enabled
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Client Instance Creation With Redis Enabled ---');
    config.redis.enabled = true;
    clientWhenEnabled = getRedisClient();
    assert(clientWhenEnabled, 'getRedisClient() must return an ioredis client instance when enabled');
    assert.strictEqual(typeof clientWhenEnabled.get, 'function', 'Client must implement ioredis interface');
    console.log('  âœ“ getRedisClient() returned an ioredis client instance when enabled (lazyConnect active, no network call made)');
  } finally {
    if (clientWhenEnabled) {
      try {
        clientWhenEnabled.disconnect();
      } catch (e) {}
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
    config.redis.enabled = true; // reset to default enabled
    console.log('\nâœ“ Teardown completed: HTTP test server closed, test database dropped, Redis reset.');
  }

  console.log('\n=== ALL REDIS-DISABLED VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
}

runTest().catch((err) => {
  console.error('\nâŒ Test failed with error:', err);
  process.exit(1);
});
