import { request } from './api.js';

/**
 * Checks whether a Razorpay keyId is a mock / placeholder key
 */
export const isMockKey = (keyId) => {
  if (!keyId) return true;
  const k = keyId.toString().toLowerCase().trim();
  return k === 'rzp_test_mock' || k === 'rzp_test_mock_key' || k.includes('mock');
};

/**
 * Ensures the official Razorpay Checkout SDK is loaded and ready
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      return resolve(true);
    }
    if (typeof document === 'undefined') {
      return resolve(false);
    }
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      if (window.Razorpay) return resolve(true);
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const paymentService = {
  isMockKey,
  loadRazorpayScript,

  createRazorpayOrder: async (orderId) => {
    const res = await request('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
    return res.data;
  },

  verifyPayment: async ({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
    const res = await request('/payments/verify', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      }),
    });
    return res.data;
  },

  getPaymentByOrderId: async (orderId) => {
    const res = await request(`/payments/order/${orderId}`);
    return res.data;
  },
};
