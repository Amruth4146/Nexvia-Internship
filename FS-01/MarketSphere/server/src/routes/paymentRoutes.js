import express from 'express';
import {
  createRazorpayOrder,
  verifyPayment,
  getPaymentByOrderId,
  handleRazorpayWebhook,
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create-order', protect, createRazorpayOrder);
router.post('/verify', protect, verifyPayment);
router.get('/order/:orderId', protect, getPaymentByOrderId);
router.post('/webhook', handleRazorpayWebhook);

export default router;
