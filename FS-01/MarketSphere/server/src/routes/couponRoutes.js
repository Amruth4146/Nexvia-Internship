import express from 'express';
import {
  getCoupons,
  validateCoupon,
  createCoupon,
} from '../controllers/couponController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getCoupons);
router.post('/validate', validateCoupon);
router.post('/', protect, authorize('vendor', 'admin'), createCoupon);

export default router;
