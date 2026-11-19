import { User } from '../models/User.js';
import { Vendor } from '../models/Vendor.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { Commission } from '../models/Commission.js';

export const getAdminDashboardMetrics = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalVendors,
      totalProducts,
      orders,
      commissions,
    ] = await Promise.all([
      User.countDocuments({}),
      Vendor.countDocuments({}),
      Product.countDocuments({ status: 'published' }),
      Order.find({ paymentStatus: 'paid' }),
      Commission.find({}),
    ]);

    const totalGMV = orders.reduce((acc, o) => acc + o.totalPrice, 0);
    const totalCommissionsEarned = commissions.reduce((acc, c) => acc + c.commissionAmount, 0);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalVendors,
        totalProducts,
        totalOrders: orders.length,
        totalGMV_INR: Math.round(totalGMV * 100) / 100,
        totalPlatformCommission_INR: Math.round(totalCommissionsEarned * 100) / 100,
        recentOrders: orders.slice(0, 5),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCommissionReports = async (req, res, next) => {
  try {
    const commissions = await Commission.find({})
      .populate('vendorId', 'name email')
      .populate('orderId', 'orderNumber totalPrice')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: commissions });
  } catch (error) {
    next(error);
  }
};

export const updateVendorStatus = async (req, res, next) => {
  try {
    const { status, isVerified, commissionRate } = req.body;
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (status) vendor.status = status;
    if (isVerified !== undefined) vendor.isVerified = Boolean(isVerified);
    if (commissionRate !== undefined) vendor.commissionRate = Number(commissionRate);

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor status updated successfully',
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllOrdersAdmin = async (req, res, next) => {
  try {
    const orders = await Order.find({})
      .populate('customerId', 'name email phone')
      .populate('vendorOrders')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};
