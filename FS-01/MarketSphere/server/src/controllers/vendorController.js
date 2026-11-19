import { Vendor } from '../models/Vendor.js';
import { Product } from '../models/Product.js';
import { VendorOrder } from '../models/VendorOrder.js';

export const getVendors = async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ status: 'approved' })
      .populate('userId', 'name email avatar')
      .sort({ rating: -1, createdAt: -1 });

    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    next(error);
  }
};

export const getVendorBySlugOrId = async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);

    const vendor = await Vendor.findOne({
      $or: [
        { storeSlug: identifier },
        ...(isObjectId ? [{ _id: identifier }] : []),
      ],
      status: 'approved',
    }).populate('userId', 'name email avatar');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor store not found' });
    }

    const products = await Product.find({
      vendorId: vendor.userId._id,
      status: 'published',
    }).populate('categoryId', 'name slug');

    res.status(200).json({
      success: true,
      data: {
        vendor,
        products,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateVendorProfile = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor record not found' });
    }

    const { businessName, description, logo, banner, gstin, pan, bankDetails, address } = req.body;
    if (businessName) vendor.businessName = businessName;
    if (description !== undefined) vendor.description = description;
    if (logo) vendor.logo = logo;
    if (banner) vendor.banner = banner;
    if (gstin) vendor.gstin = gstin;
    if (pan) vendor.pan = pan;
    if (bankDetails) vendor.bankDetails = { ...vendor.bankDetails, ...bankDetails };
    if (address) vendor.address = { ...vendor.address, ...address };

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor profile updated successfully',
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

export const getVendorMetrics = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor profile not found' });
    }

    const [totalProducts, vendorOrders] = await Promise.all([
      Product.countDocuments({ vendorId: req.user._id, status: 'published' }),
      VendorOrder.find({ vendorId: req.user._id }),
    ]);

    const totalOrders = vendorOrders.length;
    const totalSales = vendorOrders.reduce((acc, o) => acc + o.vendorTotal, 0);
    const totalPayout = vendorOrders.reduce((acc, o) => acc + o.vendorPayoutAmount, 0);
    const pendingOrders = vendorOrders.filter((o) => ['placed', 'processing'].includes(o.orderStatus)).length;

    res.status(200).json({
      success: true,
      data: {
        vendor,
        metrics: {
          totalProducts,
          totalOrders,
          totalSalesINR: Math.round(totalSales * 100) / 100,
          totalPayoutINR: Math.round(totalPayout * 100) / 100,
          pendingOrders,
          commissionRate: vendor.commissionRate,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
