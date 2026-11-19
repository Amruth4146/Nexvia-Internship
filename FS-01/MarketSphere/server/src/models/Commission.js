import mongoose from 'mongoose';

const commissionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    vendorOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorOrder',
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    commissionRate: {
      type: Number,
      required: true,
      default: 10.0,
      min: 0,
    },
    commissionAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstOnCommission: {
      type: Number,
      default: 0,
      min: 0, // 18% GST on platform commission
    },
    netVendorPayout: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'eligible_for_payout', 'paid', 'refunded', 'disputed'],
      default: 'pending',
      index: true,
    },
    payoutTransactionId: {
      type: String,
      default: null,
    },
    payoutDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Commission = mongoose.model('Commission', commissionSchema);
