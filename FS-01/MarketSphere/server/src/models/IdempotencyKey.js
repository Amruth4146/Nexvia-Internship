import mongoose from 'mongoose';

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Idempotency key is required'],
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID is required for scoping idempotency'],
      index: true,
    },
    endpoint: {
      type: String,
      default: 'POST /api/v1/orders',
    },
    requestHash: {
      type: String,
      required: [true, 'Request payload hash is required'],
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed', 'reconciliation_required'],
      default: 'in_progress',
      index: true,
    },
    ownerToken: {
      type: String,
      default: null,
      index: true,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    mutationStage: {
      type: String,
      enum: ['reserved', 'stock_mutating', 'stock_decremented', 'order_created', 'suborders_created', 'completed'],
      default: 'reserved',
    },
    orderNumber: {
      type: String,
      default: null,
      index: true,
    },
    recoveryReason: {
      type: String,
      default: null,
    },
    responseStatus: {
      type: Number,
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    expiresAt: {
      type: Date,
      default: null, // Protected: active and reconciliation_required records never expire via TTL
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Database-level compound uniqueness scoped to user and key
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
