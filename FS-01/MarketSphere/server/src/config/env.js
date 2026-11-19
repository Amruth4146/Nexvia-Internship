import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  currency: {
    code: process.env.CURRENCY || 'INR',
    symbol: process.env.CURRENCY_SYMBOL || '₹',
    freeShippingThreshold: parseFloat(process.env.FREE_SHIPPING_THRESHOLD_INR || '999'),
    defaultShippingFee: parseFloat(process.env.DEFAULT_SHIPPING_FEE_INR || '99'),
    defaultGstPercent: parseFloat(process.env.DEFAULT_GST_PERCENT || '18'),
    defaultCommissionPercent: parseFloat(process.env.DEFAULT_COMMISSION_PERCENT || '10'),
  },
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/marketsphere',
    user: process.env.MONGO_USER || '',
    password: process.env.MONGO_PASSWORD || '',
  },
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    url: process.env.REDIS_URL || undefined,
    tls: process.env.REDIS_TLS === 'true',
  },
  elasticsearch: {
    enabled:
      process.env.ELASTICSEARCH_ENABLED === 'true' ||
      (process.env.ELASTICSEARCH_ENABLED !== 'false' &&
        Boolean(
          process.env.ELASTICSEARCH_NODE &&
            process.env.ELASTICSEARCH_NODE !== 'http://localhost:9200' &&
            process.env.ELASTICSEARCH_NODE !== 'http://127.0.0.1:9200'
        )),
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    username: process.env.ELASTICSEARCH_USERNAME || '',
    password: process.env.ELASTICSEARCH_PASSWORD || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_min_32_chars',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production_min_32_chars',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'ap-south-1',
    s3Bucket: process.env.AWS_S3_BUCKET || '',
    cloudfrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || '',
  },
};

/**
 * Validates environment configuration for production readiness.
 * Ensures critical services and security secrets are present, strong, and distinct.
 * Never prints or leaks secret values in error messages.
 */
export const validateEnv = (cfg = config) => {
  if (cfg.nodeEnv !== 'production') {
    return;
  }

  const errors = [];

  if (!cfg.mongo?.uri || cfg.mongo.uri.includes('localhost') || cfg.mongo.uri.includes('127.0.0.1')) {
    errors.push('MONGO_URI must be configured for a production database (e.g. MongoDB Atlas) and cannot point to localhost.');
  }

  if (!cfg.clientOrigin || cfg.clientOrigin.includes('localhost') || cfg.clientOrigin.includes('127.0.0.1')) {
    errors.push('CLIENT_ORIGIN must be configured for a production domain (e.g. Vercel deployment URL) and cannot point to localhost.');
  }

  const devJwtSecret = 'dev_jwt_secret_change_in_production_min_32_chars';
  const devRefreshSecret = 'dev_refresh_secret_change_in_production_min_32_chars';

  if (!cfg.jwt?.secret || cfg.jwt.secret === devJwtSecret || cfg.jwt.secret.length < 32) {
    errors.push('JWT_SECRET must be set in production, must be at least 32 characters long, and cannot use the development fallback.');
  }

  if (!cfg.jwt?.refreshSecret || cfg.jwt.refreshSecret === devRefreshSecret || cfg.jwt.refreshSecret.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be set in production, must be at least 32 characters long, and cannot use the development fallback.');
  }

  if (cfg.jwt?.secret && cfg.jwt?.refreshSecret && cfg.jwt.secret === cfg.jwt.refreshSecret) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be distinct keys.');
  }

  if (!cfg.razorpay?.keyId || !cfg.razorpay?.keySecret) {
    errors.push('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured in production.');
  }

  if (!cfg.razorpay?.webhookSecret) {
    errors.push('RAZORPAY_WEBHOOK_SECRET must be configured in production.');
  }

  if (errors.length > 0) {
    const errorMsg = `Production Environment Validation Failed:\n- ${errors.join('\n- ')}`;
    throw new Error(errorMsg);
  }
};
