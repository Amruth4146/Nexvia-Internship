import { Coupon } from '../models/Coupon.js';

export const getCoupons = async (req, res, next) => {
  try {
    const coupons = await Coupon.find({ isActive: true, validUntil: { $gte: new Date() } })
      .select('-usedCount')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};

export const validateCoupon = async (req, res, next) => {
  try {
    const { code, orderSubtotal } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const subtotal = parseFloat(orderSubtotal || 0);
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon code not found' });
    }

    const check = coupon.isValidForOrder(subtotal);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.reason });
    }

    const discountAmount = coupon.calculateDiscount(subtotal);

    res.status(200).json({
      success: true,
      message: 'Coupon is valid',
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: Math.round(discountAmount * 100) / 100,
        subtotalAfterDiscount: Math.round((subtotal - discountAmount) * 100) / 100,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createCoupon = async (req, res, next) => {
  try {
    const { code, description, discountType, discountValue, minOrderValue, maxDiscountAmount, validUntil, usageLimit } = req.body;

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue: Number(discountValue),
      minOrderValue: Number(minOrderValue || 0),
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
      validUntil: new Date(validUntil),
      usageLimit: usageLimit ? Number(usageLimit) : null,
      vendorId: req.user.role === 'vendor' ? req.user._id : null,
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon,
    });
  } catch (error) {
    next(error);
  }
};
