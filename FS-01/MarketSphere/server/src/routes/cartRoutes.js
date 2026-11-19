import express from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  validateCart,
} from '../controllers/cartController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Persistent cart operations (authenticated)
router.get('/', protect, getCart);
router.post('/items', protect, addToCart);
router.put('/items/:id', protect, updateCartItem);
router.delete('/items/:id', protect, removeCartItem);
router.delete('/', protect, clearCart);

// Anonymous cart validation (public)
router.post('/validate', validateCart);

export default router;
