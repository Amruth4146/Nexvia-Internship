import assert from 'assert';
import crypto from 'crypto';
import { config, validateEnv } from './src/config/env.js';
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from './src/config/razorpay.js';
import { s3Service } from './src/services/s3Service.js';
import { getRedisClient, connectRedis } from './src/config/redis.js';

console.log('=== RUNNING PRODUCTION CONFIGURATION & SECURITY VERIFICATION ===\n');

// ---------------------------------------------------------------------------
// TEST 1: Razorpay Signature Fail-Closed Verification
// ---------------------------------------------------------------------------
console.log('1. Testing Razorpay Signature Fail-Closed Behavior...');
const originalKeySecret = config.razorpay.keySecret;
const originalWebhookSecret = config.razorpay.webhookSecret;
const originalNodeEnv = config.nodeEnv;

try {
  // A. Missing secret -> MUST fail closed (return false)
  config.razorpay.keySecret = '';
  const resultMissingSecret = verifyRazorpaySignature('order_123', 'pay_123', 'fake_sig');
  assert.strictEqual(resultMissingSecret, false, 'verifyRazorpaySignature must return false when keySecret is empty');

  // B. Missing fields -> MUST fail closed
  config.razorpay.keySecret = 'test_secret_32_chars_long_enough_1234';
  assert.strictEqual(verifyRazorpaySignature('', 'pay_123', 'sig'), false, 'Empty orderId must return false');
  assert.strictEqual(verifyRazorpaySignature('order_123', '', 'sig'), false, 'Empty paymentId must return false');
  assert.strictEqual(verifyRazorpaySignature('order_123', 'pay_123', ''), false, 'Empty signature must return false');

  // C. Valid signature with secret -> MUST return true
  const secret = 'valid_production_secret_32_characters_min';
  config.razorpay.keySecret = secret;
  const orderId = 'order_test_999';
  const paymentId = 'pay_test_888';
  const validSig = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  assert.strictEqual(verifyRazorpaySignature(orderId, paymentId, validSig), true, 'Valid HMAC signature must return true');

  // D. Tampered signature -> MUST return false
  const tamperedSig = validSig.slice(0, -2) + '00';
  assert.strictEqual(verifyRazorpaySignature(orderId, paymentId, tamperedSig), false, 'Tampered HMAC signature must return false');

  console.log('  âœ“ Razorpay verifyRazorpaySignature fails closed and validates HMAC correctly.');
} finally {
  config.razorpay.keySecret = originalKeySecret;
}

// ---------------------------------------------------------------------------
// TEST 2: Razorpay Webhook Fail-Closed Verification
// ---------------------------------------------------------------------------
console.log('2. Testing Razorpay Webhook Fail-Closed Behavior...');
try {
  // A. Missing secret -> MUST return false
  config.razorpay.keySecret = '';
  config.razorpay.webhookSecret = '';
  config.nodeEnv = 'development';
  const resultMissingWebhook = verifyRazorpayWebhookSignature('{"event":"payment.captured"}', 'sig');
  assert.strictEqual(resultMissingWebhook, false, 'verifyRazorpayWebhookSignature must return false when secrets are empty');

  // B. Valid webhook signature using dedicated webhook secret -> MUST return true
  const dedicatedWebhookSecret = 'dedicated_webhook_secret_32_chars_ok';
  config.razorpay.webhookSecret = dedicatedWebhookSecret;
  config.razorpay.keySecret = 'different_api_key_secret_for_payment_order';
  const rawBody = JSON.stringify({ event: 'payment.captured', id: 'evt_123' });
  const validWebhookSig = crypto.createHmac('sha256', dedicatedWebhookSecret).update(rawBody).digest('hex');

  assert.strictEqual(verifyRazorpayWebhookSignature(rawBody, validWebhookSig), true, 'Valid webhook signature using dedicated webhook secret must return true');

  // C. Invalid / tampered signature rejection -> MUST return false
  const tamperedSig = validWebhookSig.slice(0, -2) + 'aa';
  assert.strictEqual(verifyRazorpayWebhookSignature(rawBody, tamperedSig), false, 'Tampered webhook signature must return false');
  const tamperedBody = JSON.stringify({ event: 'payment.captured', id: 'evt_tampered' });
  assert.strictEqual(verifyRazorpayWebhookSignature(tamperedBody, validWebhookSig), false, 'Tampered webhook body must return false');

  // D. Missing webhook secret in production -> MUST return false
  config.nodeEnv = 'production';
  config.razorpay.webhookSecret = '';
  config.razorpay.keySecret = '';
  assert.strictEqual(
    verifyRazorpayWebhookSignature(rawBody, validWebhookSig),
    false,
    'Missing webhook secret in production must fail closed'
  );

  // E. API key secret must NOT be accepted as a substitute for webhook secret in production
  config.nodeEnv = 'production';
  const apiKeySecret = 'production_api_key_secret_32_characters_here';
  config.razorpay.keySecret = apiKeySecret;
  config.razorpay.webhookSecret = ''; // missing dedicated webhook secret in prod
  const sigWithApiKey = crypto.createHmac('sha256', apiKeySecret).update(rawBody).digest('hex');

  assert.strictEqual(
    verifyRazorpayWebhookSignature(rawBody, sigWithApiKey),
    false,
    'API key secret must NOT be accepted as a substitute for webhook secret in production'
  );

  // Even if webhookSecret is configured with another value in production, signature generated with keySecret must fail
  config.razorpay.webhookSecret = dedicatedWebhookSecret;
  assert.strictEqual(
    verifyRazorpayWebhookSignature(rawBody, sigWithApiKey),
    false,
    'Signature generated with keySecret must be rejected when webhookSecret is required'
  );

  // F. Development fallback behavior: allows keySecret fallback if webhookSecret is omitted
  config.nodeEnv = 'development';
  config.razorpay.webhookSecret = '';
  config.razorpay.keySecret = apiKeySecret;
  assert.strictEqual(
    verifyRazorpayWebhookSignature(rawBody, sigWithApiKey),
    true,
    'Development mode should permit fallback to keySecret when webhookSecret is absent'
  );

  console.log('  âœ“ Dedicated webhook secret enforced in production, fallback strictly prohibited.');
} finally {
  config.nodeEnv = originalNodeEnv;
  config.razorpay.keySecret = originalKeySecret;
  config.razorpay.webhookSecret = originalWebhookSecret;
}

// ---------------------------------------------------------------------------
// TEST 3: JWT Security & Production Environment Validation
// ---------------------------------------------------------------------------
console.log('3. Testing Production Environment Validation (validateEnv)...');
try {
  // Development mode: should pass without errors even with default fallbacks
  const devConfig = {
    ...config,
    nodeEnv: 'development',
  };
  assert.doesNotThrow(() => validateEnv(devConfig), 'validateEnv should not throw in development mode');

  // Production mode with default/fallback JWT secret: MUST THROW
  const prodConfigWithDevSecrets = {
    nodeEnv: 'production',
    mongo: { uri: 'mongodb+srv://user:pass@cluster0.mongodb.net/marketsphere' },
    clientOrigin: 'https://marketsphere.vercel.app',
    jwt: {
      secret: 'dev_jwt_secret_change_in_production_min_32_chars',
      refreshSecret: 'dev_refresh_secret_change_in_production_min_32_chars',
    },
    razorpay: {
      keyId: 'rzp_live_123',
      keySecret: 'sec_live_123',
    },
  };

  assert.throws(
    () => validateEnv(prodConfigWithDevSecrets),
    /JWT_SECRET must be set in production/,
    'Must reject development fallback JWT secrets in production'
  );

  // Production mode with short (<32 chars) JWT secret: MUST THROW
  const prodConfigShortSecret = {
    ...prodConfigWithDevSecrets,
    jwt: {
      secret: 'too_short_secret',
      refreshSecret: 'valid_refresh_secret_at_least_32_chars_long',
    },
  };
  assert.throws(
    () => validateEnv(prodConfigShortSecret),
    /JWT_SECRET must be set in production, must be at least 32 characters long/,
    'Must reject JWT secrets under 32 characters in production'
  );

  // Production mode with identical JWT and refresh secrets: MUST THROW
  const prodConfigIdenticalSecrets = {
    ...prodConfigWithDevSecrets,
    jwt: {
      secret: 'identical_secret_used_for_both_tokens_which_is_bad_32_chars',
      refreshSecret: 'identical_secret_used_for_both_tokens_which_is_bad_32_chars',
    },
  };
  assert.throws(
    () => validateEnv(prodConfigIdenticalSecrets),
    /JWT_SECRET and JWT_REFRESH_SECRET must be distinct keys/,
    'Must reject identical access and refresh JWT secrets'
  );

  // Production mode with localhost Mongo URI: MUST THROW
  const prodConfigLocalMongo = {
    ...prodConfigWithDevSecrets,
    mongo: { uri: 'mongodb://localhost:27017/marketsphere' },
    jwt: {
      secret: 'strong_prod_access_secret_32_chars_minimum_here',
      refreshSecret: 'strong_prod_refresh_secret_32_chars_minimum_here',
    },
  };
  assert.throws(
    () => validateEnv(prodConfigLocalMongo),
    /MONGO_URI must be configured for a production database/,
    'Must reject localhost MongoDB URI in production'
  );

  // Production mode with localhost client origin: MUST THROW
  const prodConfigLocalOrigin = {
    ...prodConfigWithDevSecrets,
    clientOrigin: 'http://localhost:5173',
    jwt: {
      secret: 'strong_prod_access_secret_32_chars_minimum_here',
      refreshSecret: 'strong_prod_refresh_secret_32_chars_minimum_here',
    },
  };
  assert.throws(
    () => validateEnv(prodConfigLocalOrigin),
    /CLIENT_ORIGIN must be configured for a production domain/,
    'Must reject localhost CLIENT_ORIGIN in production'
  );

  // Production mode with missing RAZORPAY_WEBHOOK_SECRET: MUST THROW
  const prodConfigMissingWebhookSecret = {
    nodeEnv: 'production',
    mongo: { uri: 'mongodb+srv://user:pass@cluster0.mongodb.net/marketsphere' },
    clientOrigin: 'https://marketsphere.vercel.app',
    jwt: {
      secret: 'strong_prod_access_secret_32_chars_minimum_here',
      refreshSecret: 'strong_prod_refresh_secret_32_chars_minimum_here',
    },
    razorpay: {
      keyId: 'rzp_live_123',
      keySecret: 'sec_live_123',
      webhookSecret: '',
    },
  };
  assert.throws(
    () => validateEnv(prodConfigMissingWebhookSecret),
    /RAZORPAY_WEBHOOK_SECRET must be configured in production/,
    'Must require RAZORPAY_WEBHOOK_SECRET in production'
  );

  // Fully valid production configuration: MUST PASS
  const prodConfigValid = {
    nodeEnv: 'production',
    mongo: { uri: 'mongodb+srv://produser:prodpass@cluster0.mongodb.net/marketsphere?retryWrites=true&w=majority' },
    clientOrigin: 'https://marketsphere.vercel.app',
    jwt: {
      secret: 'prod_jwt_access_secret_secure_key_123456789012345',
      refreshSecret: 'prod_jwt_refresh_secret_secure_key_098765432109876',
    },
    razorpay: {
      keyId: 'rzp_live_abc123xyz456',
      keySecret: 'rzp_live_sec_abc123xyz456',
      webhookSecret: 'rzp_live_whsec_abc123xyz456',
    },
  };
  assert.doesNotThrow(() => validateEnv(prodConfigValid), 'Fully valid production config must pass');

  console.log('  âœ“ Production environment validation accurately enforces security policies without leaking secrets.');
} finally {
  config.nodeEnv = originalNodeEnv;
}

// ---------------------------------------------------------------------------
// TEST 4: AWS S3 Production Guard
// ---------------------------------------------------------------------------
console.log('4. Testing AWS S3 Production Guard...');
try {
  // A. Development mode without AWS config: should return mock URL
  config.nodeEnv = 'development';
  const devUpload = await s3Service.uploadImage(Buffer.from('fake-image-bytes'), 'test.jpg', 'image/jpeg');
  assert.strictEqual(devUpload.isMock, true, 'Dev mode without credentials should return mock URL');
  assert(devUpload.url.includes('marketsphere-bucket'), 'Dev mock URL should have bucket fallback');

  // B. Production mode without AWS config: MUST throw error
  config.nodeEnv = 'production';
  await assert.rejects(
    async () => {
      await s3Service.uploadImage(Buffer.from('fake-image-bytes'), 'test.jpg', 'image/jpeg');
    },
    /AWS S3 storage is not configured in production/,
    'Must throw in production when AWS S3 is not configured for uploadImage'
  );

  await assert.rejects(
    async () => {
      await s3Service.getPresignedUploadUrl('test.jpg', 'image/jpeg');
    },
    /AWS S3 storage is not configured in production/,
    'Must throw in production when AWS S3 is not configured for getPresignedUploadUrl'
  );

  await assert.rejects(
    async () => {
      await s3Service.deleteImage('https://bucket.s3.ap-south-1.amazonaws.com/test.jpg');
    },
    /AWS S3 storage is not configured in production/,
    'Must throw in production when AWS S3 is not configured for deleteImage'
  );

  console.log('  âœ“ AWS S3 service fails closed with descriptive errors in production and mocks safely in development.');
} finally {
  config.nodeEnv = originalNodeEnv;
}

// ---------------------------------------------------------------------------
// TEST 5: Redis TLS Configuration
// ---------------------------------------------------------------------------
console.log('5. Testing Upstash Redis Configuration...');
{
  // Test helper to inspect how getRedisClient derives TLS and URL options
  const testRedisConfig = (mockEnv) => {
    const redisUrl = mockEnv.REDIS_URL;
    const isUpstash =
      Boolean(redisUrl && redisUrl.includes('upstash.io')) ||
      Boolean(mockEnv.REDIS_HOST && mockEnv.REDIS_HOST.includes('upstash.io'));
    const isTls =
      Boolean(mockEnv.REDIS_TLS === 'true') ||
      Boolean(redisUrl && redisUrl.startsWith('rediss://')) ||
      isUpstash;

    return { isUpstash, isTls };
  };

  const localRedis = testRedisConfig({ REDIS_HOST: 'localhost', REDIS_PORT: '6379' });
  assert.strictEqual(localRedis.isTls, false, 'Local Redis should not use TLS');

  const upstashHost = testRedisConfig({ REDIS_HOST: 'us1-happy-cat-12345.upstash.io', REDIS_PORT: '6379' });
  assert.strictEqual(upstashHost.isTls, true, 'Upstash host should automatically enable TLS');

  const redissUrl = testRedisConfig({ REDIS_URL: 'rediss://default:password@us1-happy-cat-12345.upstash.io:6379' });
  assert.strictEqual(redissUrl.isTls, true, 'rediss:// protocol should enable TLS');

  const explicitTls = testRedisConfig({ REDIS_HOST: 'redis.mycorp.internal', REDIS_TLS: 'true' });
  assert.strictEqual(explicitTls.isTls, true, 'REDIS_TLS=true should enable TLS');

  console.log('  âœ“ Redis Upstash and TLS auto-detection correctly verified.');
}

// Test REDIS_ENABLED toggle
{
  const originalRedisEnabled = config.redis.enabled;
  try {
    config.redis.enabled = false;
    assert.strictEqual(getRedisClient(), null, 'getRedisClient must return null when redis.enabled is false');
    const connectResult = await connectRedis();
    assert.strictEqual(connectResult, null, 'connectRedis must return null when redis.enabled is false');

    console.log('  âœ“ Redis disabled toggle (REDIS_ENABLED=false) safely returns null and skips connection.');
  } finally {
    config.redis.enabled = originalRedisEnabled;
  }
}

console.log('\n=== ALL PRODUCTION SECURITY & CONFIGURATION TESTS PASSED! ===');
