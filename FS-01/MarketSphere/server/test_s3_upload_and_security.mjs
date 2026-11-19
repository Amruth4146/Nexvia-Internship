import assert from 'assert';
import http from 'http';
import mongoose from 'mongoose';
import app from './src/app.js';
import { config } from './src/config/env.js';
import { s3Service } from './src/services/s3Service.js';
import { User } from './src/models/User.js';
import { generateAccessToken } from './src/utils/generateToken.js';

console.log('=== RUNNING AWS S3 UPLOAD, ACCESS CONTROL & RETRIEVAL TEST SUITE ===\n');

const TEST_DB_URI = 'mongodb://localhost:27017/marketsphere_test_s3_upload';
const PORT = 5066;
const server = http.createServer(app);

const makeRequest = (path, options = {}) => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/v1/upload${path}`,
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
          resolve({ status: res.statusCode, data: json, raw, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
};

const runTests = async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.dropDatabase();
  console.log('✓ Connected to isolated test MongoDB');

  // Seed test users
  const vendorUser = await User.create({
    name: 'Test Vendor User',
    email: 's3vendor@test.com',
    password: 'Password123!',
    role: 'vendor',
  });
  const adminUser = await User.create({
    name: 'Test Admin User',
    email: 's3admin@test.com',
    password: 'Password123!',
    role: 'admin',
  });
  const customerUser = await User.create({
    name: 'Test Customer User',
    email: 's3customer@test.com',
    password: 'Password123!',
    role: 'customer',
  });

  const vendorToken = generateAccessToken(vendorUser._id, 'vendor');
  const adminToken = generateAccessToken(adminUser._id, 'admin');
  const customerToken = generateAccessToken(customerUser._id, 'customer');

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`✓ Test Express server listening on http://127.0.0.1:${PORT}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Supported File Types (JPG, PNG, WebP)
    // -------------------------------------------------------------------------
    console.log('--- 1. Testing Supported File Uploads (JPG, PNG, WebP) ---');
    const formats = [
      { ext: 'test.jpg', mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
      { ext: 'test.png', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { ext: 'test.webp', mime: 'image/webp', bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]) },
    ];

    for (const fmt of formats) {
      const boundary = '----WebKitFormBoundaryTest123';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fmt.ext}"\r\nContent-Type: ${fmt.mime}\r\n\r\n`),
        fmt.bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await makeRequest('/image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        body,
      });

      assert.strictEqual(res.status, 200, `Expected 200 for ${fmt.mime}, got ${res.status}`);
      assert.strictEqual(res.data.success, true);
      assert(res.data.data.url, 'Upload response must include image url');
      assert(res.data.data.key.startsWith('products/'), 'Image key must be stored in products/ prefix');
      console.log(`  ✓ Successfully uploaded and handled ${fmt.mime} (${fmt.ext})`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Reject Unsupported File Formats
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Unsupported File Format Rejection ---');
    const badFormats = [
      { ext: 'malicious.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4') },
      { ext: 'script.txt', mime: 'text/plain', bytes: Buffer.from('alert("hack")') },
      { ext: 'icon.tiff', mime: 'image/tiff', bytes: Buffer.from('II*\0') },
    ];

    for (const fmt of badFormats) {
      const boundary = '----WebKitFormBoundaryTestBad';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fmt.ext}"\r\nContent-Type: ${fmt.mime}\r\n\r\n`),
        fmt.bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await makeRequest('/image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        body,
      });

      assert.strictEqual(res.status, 400, `Unsupported mime ${fmt.mime} must return 400 Bad Request`);
      console.log(`  ✓ Unsupported format ${fmt.mime} correctly rejected with HTTP ${res.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Reject Oversized Images (> 5MB Limit)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Oversized File Rejection (> 5MB Limit) ---');
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 0); // 6MB
    const boundary = '----WebKitFormBoundaryTestLarge';
    const largeBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="huge.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      largeBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const largeRes = await makeRequest('/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vendorToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': largeBody.length,
      },
      body: largeBody,
    });

    assert.strictEqual(largeRes.status, 400, 'Image > 5MB must return 400 Bad Request');
    console.log(`  ✓ Oversized 6MB image correctly rejected with HTTP ${largeRes.status}`);

    // -------------------------------------------------------------------------
    // TEST 4: Authorization Access Controls (RBAC)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Authorization Guards on S3 Endpoints ---');
    // A. Unauthenticated user
    const unauthRes = await makeRequest('/image', { method: 'POST' });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated upload must return 401');
    console.log('  ✓ Unauthenticated user upload rejected with HTTP 401');

    // B. Customer user (forbidden)
    const custBoundary = '----WebKitFormBoundaryCust';
    const custBody = Buffer.concat([
      Buffer.from(`--${custBoundary}\r\nContent-Disposition: form-data; name="image"; filename="cust.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      Buffer.from('bytes'),
      Buffer.from(`\r\n--${custBoundary}--\r\n`),
    ]);
    const custRes = await makeRequest('/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Content-Type': `multipart/form-data; boundary=${custBoundary}`,
        'Content-Length': custBody.length,
      },
      body: custBody,
    });
    assert.strictEqual(custRes.status, 403, 'Customer role cannot upload images (must return 403)');
    console.log('  ✓ Customer role upload rejected with HTTP 403 Forbidden');

    // C. Admin user (allowed)
    const adminBoundary = '----WebKitFormBoundaryAdmin';
    const adminBody = Buffer.concat([
      Buffer.from(`--${adminBoundary}\r\nContent-Disposition: form-data; name="image"; filename="admin.png"\r\nContent-Type: image/png\r\n\r\n`),
      Buffer.from('bytes'),
      Buffer.from(`\r\n--${adminBoundary}--\r\n`),
    ]);
    const adminRes = await makeRequest('/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': `multipart/form-data; boundary=${adminBoundary}`,
        'Content-Length': adminBody.length,
      },
      body: adminBody,
    });
    assert.strictEqual(adminRes.status, 200, 'Admin role can upload images');
    console.log('  ✓ Admin role upload succeeded with HTTP 200');

    // -------------------------------------------------------------------------
    // TEST 5: Presigned Upload URL Generation
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Presigned Upload URL Generation ---');
    const presignPayload = JSON.stringify({
      fileName: 'product-camera.jpg',
      fileType: 'image/jpeg',
    });
    const presignRes = await makeRequest('/presign', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vendorToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(presignPayload),
      },
      body: presignPayload,
    });
    assert.strictEqual(presignRes.status, 200);
    assert(presignRes.data.data.uploadUrl, 'Must return uploadUrl');
    assert(presignRes.data.data.publicUrl, 'Must return publicUrl');
    assert(presignRes.data.data.key.startsWith('products/'), 'Must use products/ prefix');
    console.log('  ✓ Presigned upload URL generated successfully');

    // -------------------------------------------------------------------------
    // TEST 6: Private Bucket Retrieval & CloudFront Integration
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Private Bucket Retrieval & CloudFront Redirection ---');
    const testKey = 'products/12345678-test-item.jpg';
    const directUrl = s3Service.getPublicImageUrl(testKey);
    assert(directUrl.includes(testKey), 'Image URL must contain the S3 key');
    console.log(`  ✓ getPublicImageUrl resolved URL: ${directUrl}`);

    const signedGetUrl = await s3Service.getPresignedDownloadUrl(testKey);
    assert(signedGetUrl.includes(testKey), 'Presigned GET URL must reference the key');
    console.log('  ✓ s3Service.getPresignedDownloadUrl generated signed GET URL successfully');

    const viewRes = await makeRequest(`/view/${testKey}`, {
      method: 'GET',
    });
    assert.strictEqual(viewRes.status, 302, `View endpoint must issue a 302 redirect, got ${viewRes.status}`);
    const location = viewRes.headers.location;
    assert(location, '302 redirect must include location header');
    assert(location.includes(testKey), 'Redirect location header must point to the image resource');
    console.log(`  ✓ Public view endpoint /upload/view/${testKey} returned HTTP 302 redirect to: ${location}`);

    // -------------------------------------------------------------------------
    // TEST 7: Image Deletion RBAC & Handling
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Image Deletion RBAC ---');
    const delPayload = JSON.stringify({ keyOrUrl: testKey });

    // Customer cannot delete
    const custDel = await makeRequest('/image', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(delPayload),
      },
      body: delPayload,
    });
    assert.strictEqual(custDel.status, 403, 'Customer cannot delete S3 images');
    console.log('  ✓ Customer deletion rejected with HTTP 403');

    // Vendor can delete
    const vendorDel = await makeRequest('/image', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${vendorToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(delPayload),
      },
      body: delPayload,
    });
    assert.strictEqual(vendorDel.status, 200, 'Vendor can delete S3 images');
    console.log('  ✓ Vendor deletion succeeded with HTTP 200');

    console.log('\n=== ALL S3 UPLOAD, RBAC & RETRIEVAL TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    server.close();
    process.exit(0);
  }
};

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  if (server.listening) server.close();
  process.exit(1);
});
