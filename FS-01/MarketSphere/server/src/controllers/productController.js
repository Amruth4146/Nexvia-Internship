import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Review } from '../models/Review.js';
import { Category } from '../models/Category.js';
import { cacheService } from '../services/cacheService.js';
import { searchService } from '../services/searchService.js';
import { config } from '../config/env.js';

export const getProducts = async (req, res, next) => {
  try {
    const {
      keyword,
      category,
      minPrice,
      maxPrice,
      minRating,
      sort,
      page = 1,
      limit = 12,
      featured,
    } = req.query;

    // Check Elasticsearch only if keyword is present and Elasticsearch is enabled
    if (keyword && config.elasticsearch?.enabled) {
      const esResult = await searchService.search(keyword, {
        minPrice,
        maxPrice,
        sort,
        page,
        limit,
      });

      if (esResult) {
        // Hydrate from DB for full category & vendor info, ensuring only published items are returned
        const ids = esResult.products.map((p) => p.id);
        const products = await Product.find({ _id: { $in: ids }, status: 'published' })
          .populate('categoryId', 'name slug')
          .populate('vendorId', 'name avatar');

        return res.status(200).json({
          success: true,
          data: {
            products,
            pagination: {
              total: esResult.total,
              page: parseInt(page, 10),
              pages: Math.ceil(esResult.total / parseInt(limit, 10)),
              limit: parseInt(limit, 10),
            },
            searchEngine: 'elasticsearch',
          },
        });
      }
    }

    // Standard MongoDB query fallback (reliable default search engine)
    const query = { status: 'published' };

    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { brand: { $regex: keyword, $options: 'i' } },
        { sku: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (category) {
      const cat = await Category.findOne({
        $or: [
          { slug: category },
          ...(category.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: category }] : []),
        ],
        isActive: true,
      });
      if (cat) {
        query.categoryId = cat._id;
      } else {
        // Requested category is inactive or non-existent
        query.categoryId = new mongoose.Types.ObjectId();
      }
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
    }

    if (minRating !== undefined) {
      query.averageRating = { $gte: Number(minRating) };
    }

    if (featured === 'true') {
      query.isFeatured = true;
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price_asc') sortOption = { price: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1 };
    else if (sort === 'rating') sortOption = { averageRating: -1, reviewCount: -1 };
    else if (sort === 'oldest') sortOption = { createdAt: 1 };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('categoryId', 'name slug')
        .populate('vendorId', 'name avatar')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
        searchEngine: 'mongodb',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getFeaturedProducts = async (req, res, next) => {
  try {
    const cacheKey = 'products:featured';
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        source: 'cache',
      });
    }

    let products = await Product.find({ status: 'published', isFeatured: true })
      .populate('categoryId', 'name slug')
      .populate('vendorId', 'name avatar')
      .limit(8)
      .lean();

    // If no products are explicitly tagged isFeatured, showcase top published products
    if (!products || products.length === 0) {
      products = await Product.find({ status: 'published' })
        .populate('categoryId', 'name slug')
        .populate('vendorId', 'name avatar')
        .sort({ averageRating: -1, createdAt: -1 })
        .limit(8)
        .lean();
    }

    await cacheService.set(cacheKey, products, 1800);

    res.status(200).json({
      success: true,
      data: products,
      source: 'database',
    });
  } catch (error) {
    next(error);
  }
};

export const getProductBySlugOrId = async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);

    const product = await Product.findOne({
      $or: [
        { slug: identifier },
        ...(isObjectId ? [{ _id: identifier }] : []),
      ],
    })
      .populate('categoryId', 'name slug')
      .populate('vendorId', 'name email avatar');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or unavailable',
      });
    }

    // Archived products are unavailable
    if (product.status === 'archived') {
      return res.status(404).json({
        success: false,
        message: 'Product is unavailable (archived or removed)',
      });
    }

    // Draft products are only viewable by their vendor or platform admins
    if (product.status === 'draft') {
      const isOwnerOrAdmin =
        req.user &&
        (req.user.role === 'admin' ||
          product.vendorId?._id?.toString() === req.user._id?.toString());
      if (!isOwnerOrAdmin) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or unavailable',
        });
      }
    }

    const reviews = await Review.find({ productId: product._id })
      .populate('customerId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: {
        product,
        reviews,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const {
      title,
      description,
      categoryId,
      price,
      discountPrice,
      stock,
      sku,
      images,
      brand,
      attributes,
      isFeatured,
    } = req.body;

    const product = await Product.create({
      title,
      description,
      categoryId,
      vendorId: req.user._id,
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : null,
      stock: parseInt(stock, 10),
      sku: sku.toUpperCase(),
      images,
      brand: brand || '',
      attributes: attributes || {},
      isFeatured: Boolean(isFeatured),
      status: 'published',
    });

    // Invalidate Redis caches & index in Elasticsearch
    await Promise.allSettled([
      cacheService.del('products:featured'),
      searchService.indexProduct(product),
    ]);

    res.status(201).json({
      success: true,
      message: 'Product listed successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (
      product.vendorId.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not own this product listing',
      });
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    await Promise.allSettled([
      cacheService.del('products:featured'),
      searchService.indexProduct(updated),
    ]);

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (
      product.vendorId.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to delete this listing',
      });
    }

    await product.deleteOne();

    await Promise.allSettled([
      cacheService.del('products:featured'),
      searchService.removeProduct(product._id),
    ]);

    res.status(200).json({
      success: true,
      message: 'Product listing removed',
    });
  } catch (error) {
    next(error);
  }
};
