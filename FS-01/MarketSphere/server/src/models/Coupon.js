import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Please provide coupon code'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: [true, 'Please provide discount value'],
      min: [1, 'Discount value must be at least 1'],
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscountAmount: {
      type: Number,
      default: null, // Cap for percentage discounts in INR
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: [true, 'Please provide expiry date'],
    },
    usageLimit: {
      type: Number,
      default: null, // Null means unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Null indicates platform-wide coupon created by admin
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Method to validate if coupon is currently valid for an order amount
couponSchema.methods.isValidForOrder = function (orderSubtotal) {
  const now = new Date();
  if (!this.isActive) return { valid: false, reason: 'Coupon is inactive' };
  if (now < this.validFrom) return { valid: false, reason: 'Coupon is not yet active' };
  if (now > this.validUntil) return { valid: false, reason: 'Coupon has expired' };
  if (this.usageLimit && this.usedCount >= this.usageLimit) {
    return { valid: false, reason: 'Coupon usage limit has been reached' };
  }
  if (orderSubtotal < this.minOrderValue) {
    return {
      valid: false,
      reason: `Minimum order amount of ₹${this.minOrderValue} required for this coupon`,
    };
  }
  return { valid: true };
};

// Method to calculate discount amount given subtotal
couponSchema.methods.calculateDiscount = function (orderSubtotal) {
  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (orderSubtotal * this.discountValue) / 100;
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else {
    discount = this.discountValue;
  }
  return Math.min(discount, orderSubtotal);
};

export const Coupon = mongoose.model('Coupon', couponSchema);
