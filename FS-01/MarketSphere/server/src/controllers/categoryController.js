import { Category } from '../models/Category.js';
import { getRedisClient } from '../config/redis.js';

export const getCategories = async (req, res, next) => {
  try {
    const redis = getRedisClient();
    const cacheKey = 'categories:all';

    // Try Redis cache first
    try {
      const cached = await redis?.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
          source: 'cache',
        });
      }
    } catch (e) {
      // Redis fallback silently
    }

    const categories = await Category.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    // Cache in Redis for 1 hour
    try {
      await redis?.set(cacheKey, JSON.stringify(categories), 'EX', 3600);
    } catch (e) {
      // Ignore cache write error
    }

    res.status(200).json({
      success: true,
      data: categories,
      source: 'database',
    });
  } catch (error) {
    next(error);
  }
};

export const getCategoryBySlug = async (req, res, next) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, description, icon, image, displayOrder, parentId } = req.body;
    const category = await Category.create({
      name,
      description,
      icon,
      image,
      displayOrder,
      parentId: parentId || null,
    });

    // Invalidate Redis cache
    try {
      const redis = getRedisClient();
      await redis?.del('categories:all');
    } catch (e) {}

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

