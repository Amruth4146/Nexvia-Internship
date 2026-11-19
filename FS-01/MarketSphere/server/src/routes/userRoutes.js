import express from 'express';
import {
  getUsers,
  getUserById,
  updateUserStatus,
  getMyAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Customer Addresses
router.get('/addresses', protect, getMyAddresses);
router.post('/addresses', protect, createAddress);
router.put('/addresses/:id', protect, updateAddress);
router.delete('/addresses/:id', protect, deleteAddress);

// Admin User Management
router.get('/', protect, authorize('admin'), getUsers);
router.get('/:id', protect, authorize('admin'), getUserById);
router.put('/:id/status', protect, authorize('admin'), updateUserStatus);

export default router;
