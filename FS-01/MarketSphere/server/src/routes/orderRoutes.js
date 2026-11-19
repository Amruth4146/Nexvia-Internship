import express from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  getVendorOrders,
  updateVendorOrderStatus,
  downloadOrderInvoice,
  downloadVendorOrderInvoice,
} from '../controllers/orderController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { createOrderValidator } from '../validators/orderValidator.js';

const router = express.Router();

router.post('/', protect, createOrderValidator, validateRequest, createOrder);
router.get('/my', protect, getMyOrders);
router.get('/vendor', protect, authorize('vendor', 'admin'), getVendorOrders);
router.get('/vendor-orders/:id/invoice', protect, downloadVendorOrderInvoice);
router.get('/:id/invoice', protect, downloadOrderInvoice);
router.get('/:id', protect, getOrderById);
router.put('/vendor/:id/status', protect, authorize('vendor', 'admin'), updateVendorOrderStatus);

export default router;
