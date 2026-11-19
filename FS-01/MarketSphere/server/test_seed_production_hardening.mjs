import assert from 'assert';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== RUNNING SEED SCRIPT PRODUCTION HARDENING & ISOLATION TEST SUITE ===\n');

const TEST_DB_NAME = 'marketsphere_test_seed_hardening';
const TEST_DB_URI = `mongodb://localhost:27017/${TEST_DB_NAME}`;
const SEED_SCRIPT = path.join(__dirname, 'src', 'utils', 'seed.js');

const runSeedProcess = (env = {}, args = []) => {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [SEED_SCRIPT, ...args],
      {
        env: {
          ...process.env,
          MONGO_URI: TEST_DB_URI,
          ...env,
        },
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? error.code : 0,
          stdout,
          stderr,
        });
      }
    );
  });
};

const runAudit = async () => {
  // Connect to isolated test database
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.dropDatabase();
  console.log(`✓ Connected to clean isolated test database: ${TEST_DB_NAME}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Production Guard Blocks Without --confirm-production
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Production Guard Verification ---');
    const blockedResult = await runSeedProcess({ NODE_ENV: 'production' }, []);
    assert.strictEqual(blockedResult.code, 1, 'Production seed must exit with code 1 if --confirm-production is omitted');
    assert(
      blockedResult.stderr.includes('Production database detected') || blockedResult.stderr.includes('--confirm-production'),
      'Must print safety warning to stderr'
    );
    console.log('  ✓ Production seed safely halted when --confirm-production was omitted');

    // -------------------------------------------------------------------------
    // TEST 2: Production Seeding (Zero Admin, 5 Categories, 25 Products)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Hardened Production Seeding ---');
    // Create an approved vendor in the isolated test database.
    const testVendorUserId = new mongoose.Types.ObjectId();
    const testVendorId = new mongoose.Types.ObjectId();

    await mongoose.connection.db.collection('users').insertOne({
      _id: testVendorUserId,
      name: 'Test Vendor',
      email: 'testvendor@example.com',
      password: await bcrypt.hash('TestPassword123!', 10),
      role: 'vendor',
      vendorId: testVendorId,
      isActive: true
    });

    await mongoose.connection.db.collection('vendors').insertOne({
      _id: testVendorId,
      userId: testVendorUserId,
      businessName: 'Test Vendor Store',
      storeSlug: 'test-vendor-store',
      status: 'approved',
      isVerified: false
    });
    const prodResult = await runSeedProcess({ NODE_ENV: 'production' }, ['--confirm-production']);
    assert.strictEqual(prodResult.code, 0, `Production seed failed with stdout: ${prodResult.stdout} stderr: ${prodResult.stderr}`);
    assert(!prodResult.stdout.includes('Password123!'), 'Production stdout must NEVER print Password123!');
    assert(!prodResult.stdout.includes('admin@marketsphere.com'), 'Production stdout must NEVER output admin credentials');

    // Verify Database Collections
    const usersCollection = mongoose.connection.db.collection('users');
    const categoriesCollection = mongoose.connection.db.collection('categories');
    const productsCollection = mongoose.connection.db.collection('products');
    const reviewsCollection = mongoose.connection.db.collection('reviews');

    // 1. Verify NO admin user exists
    const adminUser = await usersCollection.findOne({ role: 'admin' });
    assert.strictEqual(adminUser, null, 'Production seeding must NEVER create an admin account');
    console.log('  ✓ Verified: Zero admin accounts created in production mode');

    // 2. Verify the existing approved vendor was reused.
    const vendorUsers = await usersCollection.find({ role: 'vendor' }).toArray();

    assert.strictEqual(vendorUsers.length, 1, 'Production must reuse the existing vendor without creating demo vendors');

    const reusedVendor = await mongoose.connection.db
      .collection('vendors')
      .findOne({ _id: testVendorId });

    assert(reusedVendor, 'Existing approved vendor must be preserved');
    assert.strictEqual(reusedVendor.status, 'approved');

    console.log('  ✓ Verified: Existing approved vendor reused; no demo vendor created');

    // 3. Verify Categories and Products
    const catCount = await categoriesCollection.countDocuments();
    assert.strictEqual(catCount, 5, 'Must create exactly 5 categories');
    console.log('  ✓ Verified: Exactly 5 categories created in production');

    const prodCount = await productsCollection.countDocuments();
    assert.strictEqual(prodCount, 25, 'Must create exactly 25 products');
    console.log('  ✓ Verified: Exactly 25 products created in production');

    // 4. Verify NO fake reviews in production
    const reviewCount = await reviewsCollection.countDocuments();
    assert.strictEqual(reviewCount, 0, 'Production must not seed fake reviews');
    console.log('  ✓ Verified: Zero fake reviews created in production');

    // -------------------------------------------------------------------------
    // TEST 3: Preservation of Existing Records & Idempotency
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Idempotency & Record Preservation ---');
    // Insert existing custom user, order, payment, and product
    const ordersCollection = mongoose.connection.db.collection('orders');
    const paymentsCollection = mongoose.connection.db.collection('payments');

    const customUser = await usersCollection.insertOne({
      name: 'Existing Real Customer',
      email: 'realcustomer@domain.com',
      password: 'customHashedPassword',
      role: 'customer',
    });

    const customOrder = await ordersCollection.insertOne({
      orderNumber: 'MS-PROD-9999',
      userId: customUser.insertedId,
      totalAmount: 15999,
      paymentStatus: 'completed',
    });

    const customPayment = await paymentsCollection.insertOne({
      orderId: customOrder.insertedId,
      razorpayPaymentId: 'pay_live_test_12345',
      status: 'captured',
    });

    const customProduct = await productsCollection.insertOne({
      title: 'Pre-existing Merchant Product',
      sku: 'CUSTOM-PROD-SKU-001',
      price: 4999,
      status: 'published',
    });

    // Rerun production seed
    const rerunResult = await runSeedProcess({ NODE_ENV: 'production' }, ['--confirm-production']);
    assert.strictEqual(rerunResult.code, 0, 'Rerun production seed must succeed cleanly');

    // Verify existing records are 100% untouched
    const checkUser = await usersCollection.findOne({ email: 'realcustomer@domain.com' });
    assert(checkUser, 'Existing customer must not be deleted');
    assert.strictEqual(checkUser.name, 'Existing Real Customer');

    const checkOrder = await ordersCollection.findOne({ orderNumber: 'MS-PROD-9999' });
    assert(checkOrder, 'Existing order must not be deleted');

    const checkPayment = await paymentsCollection.findOne({ razorpayPaymentId: 'pay_live_test_12345' });
    assert(checkPayment, 'Existing payment must not be deleted');

    const checkCustomProd = await productsCollection.findOne({ sku: 'CUSTOM-PROD-SKU-001' });
    assert(checkCustomProd, 'Existing merchant product must not be deleted or overwritten');

    // Verify total counts: categories remains 5, products is 26 (25 seed + 1 pre-existing)
    const finalCatCount = await categoriesCollection.countDocuments();
    assert.strictEqual(finalCatCount, 5, 'Rerun must not duplicate categories');

    const finalProdCount = await productsCollection.countDocuments();
    assert.strictEqual(finalProdCount, 26, 'Rerun must not duplicate products');
    console.log('  ✓ Verified: Existing user, order, payment, and product preserved untouched');
    console.log('  ✓ Verified: Rerun is 100% idempotent and created 0 duplicate records');

    // -------------------------------------------------------------------------
    // TEST 4: Development Mode Preserves Full Developer Experience
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Development Mode Preserved ---');
    const devResult = await runSeedProcess({ NODE_ENV: 'development' }, []);
    assert.strictEqual(devResult.code, 0, 'Development seed must succeed');
    assert(devResult.stdout.includes('Customer: alex@example.com / Password123!'), 'Dev stdout should include test customer');
    assert(devResult.stdout.includes('Admin: admin@marketsphere.com / Password123!'), 'Dev stdout should include test admin');

    const devAdmin = await usersCollection.findOne({ email: 'admin@marketsphere.com' });
    assert(devAdmin, 'Dev mode must create admin account');
    const isDevPassValid = await bcrypt.compare('Password123!', devAdmin.password);
    assert.strictEqual(isDevPassValid, true, 'Dev admin password must match Password123!');
    console.log('  ✓ Verified: Development mode preserves test admin, customer, coupons, and test account logging');

    console.log('\n=== ALL SEED HARDENING & ISOLATION TESTS PASSED WITH 100% SUCCESS ===');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
};

runAudit().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
