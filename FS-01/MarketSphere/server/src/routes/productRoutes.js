import express from 'express';
import {
  getProducts,
  getFeaturedProducts,
  getProductBySlugOrId,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import { protect, authorize, optionalProtect } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { productValidator } from '../validators/productValidator.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/:identifier', optionalProtect, getProductBySlugOrId);

// Vendor / Admin management routes
router.post(
  '/',
  protect,
  authorize('vendor', 'admin'),
  productValidator,
  validateRequest,
  createProduct
);
router.put('/:id', protect, authorize('vendor', 'admin'), updateProduct);
router.delete('/:id', protect, authorize('vendor', 'admin'), deleteProduct);

export default router;
