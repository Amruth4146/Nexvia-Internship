import express from 'express';
import {
  getVendors,
  getVendorBySlugOrId,
  updateVendorProfile,
  getVendorMetrics,
} from '../controllers/vendorController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getVendors);
router.get('/dashboard/metrics', protect, authorize('vendor', 'admin'), getVendorMetrics);
router.get('/:identifier', getVendorBySlugOrId);
router.put('/profile', protect, authorize('vendor', 'admin'), updateVendorProfile);

export default router;
