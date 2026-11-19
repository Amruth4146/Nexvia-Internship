import assert from 'assert';
import mongoose from 'mongoose';
import http from 'http';
import { config } from './src/config/env.js';
import { getElasticClient, checkElasticConnection, closeElasticClient } from './src/config/elasticsearch.js';
import { searchService } from './src/services/searchService.js';
import { User } from './src/models/User.js';
import { Vendor } from './src/models/Vendor.js';
import { Category } from './src/models/Category.js';
import { Product } from './src/models/Product.js';
import app from './src/app.js';
import { generateAccessToken } from './src/utils/generateToken.js';

console.log('=== RUNNING COMPREHENSIVE PRODUCT STATUS, SEARCH & INVENTORY AUDIT ===\n');

const TEST_DB_URI = 'mongodb://localhost:27017/marketsphere_test_search_status';

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

async function runTests() {
  await mongoose.connect(TEST_DB_URI);
  console.log('✓ Connected to isolated test MongoDB');

  // Clean test DB
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }

  // Bind test server to dynamic port
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const TEST_PORT = server.address().port;
  console.log(`✓ Test server running on http://127.0.0.1:${TEST_PORT}\n`);

  try {
    // ========================================================
    // SECTION 1: Elasticsearch Configuration & Fallback Tests
    // ========================================================
    console.log('--- SECTION 1: Elasticsearch Configuration & Fallback ---');

    // 1A. When disabled, getElasticClient returns null
    config.elasticsearch.enabled = false;
    const clientWhenDisabled = getElasticClient();
    assert.strictEqual(clientWhenDisabled, null, 'getElasticClient must return null when disabled');
    console.log('  ✓ getElasticClient() returns null when ELASTICSEARCH_ENABLED=false');

    // 1B. checkElasticConnection returns false without connection warnings or attempts
    const isConnectedWhenDisabled = await checkElasticConnection();
    assert.strictEqual(isConnectedWhenDisabled, false, 'checkElasticConnection must return false when disabled');
    console.log('  ✓ checkElasticConnection() returns false cleanly when disabled');

    // 1C. searchService operations return safely without calling Elasticsearch
    const searchResWhenDisabled = await searchService.search('wireless');
    assert.strictEqual(searchResWhenDisabled, null, 'searchService.search must return null when disabled (signaling MongoDB fallback)');
    console.log('  ✓ searchService.search() returns null to trigger MongoDB fallback');

    await searchService.indexProduct({ _id: new mongoose.Types.ObjectId(), title: 'Test Product' });
    console.log('  ✓ searchService.indexProduct() is a safe no-op when disabled');

    await searchService.removeProduct(new mongoose.Types.ObjectId());
    console.log('  ✓ searchService.removeProduct() is a safe no-op when disabled');

    // 1D. When enabled, getElasticClient returns client instance
    config.elasticsearch.enabled = true;
    const clientWhenEnabled = getElasticClient();
    assert.ok(clientWhenEnabled !== null, 'getElasticClient must return a client when enabled');
    assert.strictEqual(typeof clientWhenEnabled.search, 'function', 'client has search method');
    console.log('  ✓ getElasticClient() instantiates client when ELASTICSEARCH_ENABLED=true');
    await closeElasticClient();

    // Reset to disabled for remaining MongoDB product tests
    config.elasticsearch.enabled = false;

    // ========================================================
    // SECTION 2: Seed Test Data with Different Product Statuses
    // ========================================================
    console.log('\n--- SECTION 2: Seeding Products with Various Statuses ---');

    const vendorUser = await User.create({
      name: 'Test Vendor User',
      email: 'vendor@teststatus.com',
      password: 'Password123!',
      role: 'vendor',
      phone: '9820011111',
    });

    const vendorProfile = await Vendor.create({
      userId: vendorUser._id,
      businessName: 'Status Test Store',
      storeSlug: 'status-test-store',
      description: 'Vendor for testing status filters',
      gstin: '27AABCU9603R1ZN',
      pan: 'AABCU9603R',
      isVerified: true,
      status: 'approved',
    });

    const otherVendorUser = await User.create({
      name: 'Other Vendor User',
      email: 'othervendor@teststatus.com',
      password: 'Password123!',
      role: 'vendor',
      phone: '9820022222',
    });

    const testCategory = await Category.create({
      name: 'Electronics Test',
      slug: 'electronics-test',
      description: 'Category for testing status',
      icon: 'Headphones',
      displayOrder: 1,
      isActive: true,
    });

    const testCategoryFashion = await Category.create({
      name: 'Fashion Test',
      slug: 'fashion-test',
      description: 'Category for testing fashion status',
      icon: 'Shirt',
      displayOrder: 2,
      isActive: true,
    });

    // 1. Published In-Stock
    const prodInStock = await Product.create({
      title: 'Active In-Stock Wireless Headphones',
      slug: 'active-in-stock-wireless-headphones',
      description: 'Premium active in-stock item',
      vendorId: vendorUser._id,
      categoryId: testCategory._id,
      price: 9999,
      discountPrice: 8999,
      stock: 25,
      sku: 'TEST-HDPH-INSTOCK',
      brand: 'AudioPro',
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'],
      status: 'published',
      isFeatured: true,
    });

    // 2. Published Out-of-Stock (stock: 0)
    const prodOutOfStock = await Product.create({
      title: 'Active Out-of-Stock Wireless Earbuds',
      slug: 'active-out-of-stock-wireless-earbuds',
      description: 'High-demand item currently sold out',
      vendorId: vendorUser._id,
      categoryId: testCategory._id,
      price: 4999,
      stock: 0,
      sku: 'TEST-EARB-OUTOFSTOCK',
      brand: 'AudioPro',
      images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800'],
      status: 'published',
      isFeatured: true,
    });

    // 3. Draft Product (should not appear in public listings)
    const prodDraft = await Product.create({
      title: 'Unpublished Draft Studio Monitor',
      slug: 'unpublished-draft-studio-monitor',
      description: 'Work in progress draft listing',
      vendorId: vendorUser._id,
      categoryId: testCategory._id,
      price: 19999,
      stock: 10,
      sku: 'TEST-MONI-DRAFT',
      brand: 'AudioPro',
      images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800'],
      status: 'draft',
      isFeatured: false,
    });

    // 4. Archived Product (soft-deleted / removed)
    const prodArchived = await Product.create({
      title: 'Discontinued Archived Vintage Speaker',
      slug: 'discontinued-archived-vintage-speaker',
      description: 'Removed legacy product',
      vendorId: vendorUser._id,
      categoryId: testCategory._id,
      price: 12999,
      stock: 15,
      sku: 'TEST-SPKR-ARCHIVED',
      brand: 'AudioPro',
      images: ['https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800'],
      status: 'archived',
      isFeatured: false,
    });

    console.log('  ✓ Seeded 4 products: published in-stock, published out-of-stock, draft, and archived');

    // ========================================================
    // SECTION 3: Listing & Search Visibility Tests
    // ========================================================
    console.log('\n--- SECTION 3: Verifying Product Listings & Search Exclusions ---');

    // 3A. All Product Listings: must include in-stock and out-of-stock, but EXCLUDE draft and archived
    const listRes = await makeRequest(TEST_PORT, '/products');
    assert.strictEqual(listRes.status, 200);
    const listedIds = listRes.data.data.products.map((p) => p._id.toString());

    assert.ok(listedIds.includes(prodInStock._id.toString()), 'In-stock published product must be included');
    assert.ok(listedIds.includes(prodOutOfStock._id.toString()), 'Out-of-stock published product must be included (not hidden)');
    assert.ok(!listedIds.includes(prodDraft._id.toString()), 'Draft product must be excluded from public listings');
    assert.ok(!listedIds.includes(prodArchived._id.toString()), 'Archived product must be excluded from public listings');
    assert.strictEqual(listRes.data.data.searchEngine, 'mongodb', 'Default searchEngine must report mongodb');
    console.log('  ✓ Public product listing includes published products (both in-stock & out-of-stock) and strictly excludes draft & archived products');

    // 3B. Category Listings: must exclude draft and archived
    const catListRes = await makeRequest(TEST_PORT, `/products?category=${testCategory.slug}`);
    assert.strictEqual(catListRes.status, 200);
    const catListedIds = catListRes.data.data.products.map((p) => p._id.toString());
    assert.ok(catListedIds.includes(prodInStock._id.toString()));
    assert.ok(catListedIds.includes(prodOutOfStock._id.toString()));
    assert.ok(!catListedIds.includes(prodDraft._id.toString()));
    assert.ok(!catListedIds.includes(prodArchived._id.toString()));
    console.log('  ✓ Category product listing strictly excludes draft and archived products');

    // 3C. Keyword Search: search by keyword matching title or brand
    const searchRes = await makeRequest(TEST_PORT, '/products?keyword=AudioPro');
    assert.strictEqual(searchRes.status, 200);
    const searchMatchedIds = searchRes.data.data.products.map((p) => p._id.toString());
    assert.ok(searchMatchedIds.includes(prodInStock._id.toString()));
    assert.ok(searchMatchedIds.includes(prodOutOfStock._id.toString()));
    assert.ok(!searchMatchedIds.includes(prodDraft._id.toString()), 'Draft must not appear in search results');
    assert.ok(!searchMatchedIds.includes(prodArchived._id.toString()), 'Archived must not appear in search results');
    assert.strictEqual(searchRes.data.data.searchEngine, 'mongodb', 'Keyword search operates on MongoDB engine');
    console.log('  ✓ MongoDB keyword search works and excludes draft & archived products');

    // 3D. Search by SKU: verify SKU search support
    const skuSearchRes = await makeRequest(TEST_PORT, '/products?keyword=TEST-HDPH-INSTOCK');
    assert.strictEqual(skuSearchRes.status, 200);
    assert.strictEqual(skuSearchRes.data.data.products.length, 1);
    assert.strictEqual(skuSearchRes.data.data.products[0]._id.toString(), prodInStock._id.toString());
    console.log('  ✓ MongoDB search successfully finds products by SKU');

    // 3E. Featured Arrivals: must return only published products
    const featuredRes = await makeRequest(TEST_PORT, '/products/featured');
    assert.strictEqual(featuredRes.status, 200);
    const featuredIds = featuredRes.data.data.map((p) => p._id.toString());
    assert.ok(featuredIds.includes(prodInStock._id.toString()));
    assert.ok(!featuredIds.includes(prodDraft._id.toString()), 'Draft must not appear in featured products');
    assert.ok(!featuredIds.includes(prodArchived._id.toString()), 'Archived must not appear in featured products');
    console.log('  ✓ Featured arrivals endpoint excludes draft & archived products');

    // ========================================================
    // SECTION 4: Product Details API (404 and Access Rules)
    // ========================================================
    console.log('\n--- SECTION 4: Product Details API Availability & 404 Tests ---');

    // 4A. Published in-stock product: returns 200 with accurate stock
    const detailInStock = await makeRequest(TEST_PORT, `/products/${prodInStock.slug}`);
    assert.strictEqual(detailInStock.status, 200);
    assert.strictEqual(detailInStock.data.data.product.stock, 25);
    console.log('  ✓ Published in-stock product returns HTTP 200 with stock quantity');

    // 4B. Published out-of-stock product: returns 200 with stock = 0
    const detailOutOfStock = await makeRequest(TEST_PORT, `/products/${prodOutOfStock.slug}`);
    assert.strictEqual(detailOutOfStock.status, 200);
    assert.strictEqual(detailOutOfStock.data.data.product.stock, 0);
    console.log('  ✓ Published out-of-stock product returns HTTP 200 with stock = 0 (viewable but out of stock)');

    // 4C. Archived (soft-deleted) product: returns 404
    const detailArchived = await makeRequest(TEST_PORT, `/products/${prodArchived.slug}`);
    assert.strictEqual(detailArchived.status, 404, 'Archived product must return 404');
    assert.strictEqual(detailArchived.data.success, false);
    console.log('  ✓ Archived product returns HTTP 404 unavailable response');

    // 4D. Non-existent product: returns 404
    const detailNonExistent = await makeRequest(TEST_PORT, '/products/non-existent-product-slug');
    assert.strictEqual(detailNonExistent.status, 404);
    assert.strictEqual(detailNonExistent.data.success, false);
    console.log('  ✓ Non-existent product returns HTTP 404 response');

    // 4E. Draft product requested by unauthenticated guest: returns 404
    const detailDraftGuest = await makeRequest(TEST_PORT, `/products/${prodDraft.slug}`);
    assert.strictEqual(detailDraftGuest.status, 404, 'Draft product must return 404 for guests');
    console.log('  ✓ Draft product returns HTTP 404 for unauthenticated visitors');

    // 4F. Draft product requested by other vendor: returns 404
    const otherVendorToken = generateAccessToken(otherVendorUser._id, otherVendorUser.role);
    const detailDraftOtherVendor = await makeRequest(TEST_PORT, `/products/${prodDraft.slug}`, {
      headers: { Authorization: `Bearer ${otherVendorToken}` },
    });
    assert.strictEqual(detailDraftOtherVendor.status, 404, 'Draft product must return 404 for unauthorized vendors');
    console.log('  ✓ Draft product returns HTTP 404 for non-owner vendors');

    // 4G. Draft product requested by owner vendor: returns 200
    const ownerToken = generateAccessToken(vendorUser._id, vendorUser.role);
    const detailDraftOwner = await makeRequest(TEST_PORT, `/products/${prodDraft.slug}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(detailDraftOwner.status, 200, 'Draft product must return 200 for its owner vendor');
    assert.strictEqual(detailDraftOwner.data.data.product.title, prodDraft.title);
    console.log('  ✓ Draft product returns HTTP 200 for its owning vendor');

    // ========================================================
    // SECTION 5: CRUD Operations with Elasticsearch Disabled
    // ========================================================
    console.log('\n--- SECTION 5: CRUD Operations with Elasticsearch Disabled ---');

    // 5A. Create Product
    const createRes = await makeRequest(TEST_PORT, '/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: {
        title: 'New Wireless Lavalier Microphone Kit',
        description: 'Professional wireless clip-on microphone with USB-C receiver',
        categoryId: testCategory._id.toString(),
        price: 3499,
        discountPrice: 2999,
        stock: 50,
        sku: 'TEST-MIC-LAV-01',
        brand: 'AudioPro',
        images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800'],
      },
    });
    assert.strictEqual(createRes.status, 201);
    const createdProduct = createRes.data.data;
    assert.strictEqual(createdProduct.title, 'New Wireless Lavalier Microphone Kit');
    console.log('  ✓ Product creation succeeds without error when Elasticsearch is disabled');

    // 5B. Update Product
    const updateRes = await makeRequest(TEST_PORT, `/products/${createdProduct._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: {
        price: 3299,
        stock: 45,
      },
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.data.price, 3299);
    console.log('  ✓ Product update succeeds without error when Elasticsearch is disabled');

    // 5C. Delete Product
    const deleteRes = await makeRequest(TEST_PORT, `/products/${createdProduct._id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.strictEqual(deleteRes.status, 200);
    const checkDeleted = await Product.findById(createdProduct._id);
    assert.strictEqual(checkDeleted, null, 'Deleted product must no longer exist in MongoDB');
    console.log('  ✓ Product deletion succeeds and removes product from MongoDB cleanly');

    console.log('\n=== ALL PRODUCT STATUS, SEARCH & INVENTORY AUDIT TESTS PASSED ===');
    process.exit(0);
  } finally {
    server.close();
    await mongoose.connection.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
