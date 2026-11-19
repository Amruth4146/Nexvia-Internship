import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from './env.js';

let razorpayInstance = null;

export const getRazorpayClient = () => {
  if (!razorpayInstance) {
    if (config.razorpay.keyId && config.razorpay.keySecret) {
      razorpayInstance = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
      });
      console.log('[Razorpay] Client initialized with credentials');
    } else {
      console.warn('[Razorpay] Keys not configured. Operating in mock/test mode.');
    }
  }
  return razorpayInstance;
};

/**
 * Verifies Razorpay payment signature using HMAC SHA256
 */
export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  if (!config.razorpay.keySecret || !orderId || !paymentId || !signature) {
    return false;
  }
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body.toString())
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
};

/**
 * Verifies Razorpay Webhook signature using raw request body.
 * In production, strictly requires RAZORPAY_WEBHOOK_SECRET and never falls back to API key secret.
 */
export const verifyRazorpayWebhookSignature = (rawBody, signature) => {
  const secret =
    config.nodeEnv === 'production'
      ? config.razorpay.webhookSecret
      : (config.razorpay.webhookSecret || config.razorpay.keySecret);

  if (!secret || !rawBody || !signature) {
    return false;
  }
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
};
