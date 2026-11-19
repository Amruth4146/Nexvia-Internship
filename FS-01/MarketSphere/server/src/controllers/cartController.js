import { Product } from '../models/Product.js';
import { Cart } from '../models/Cart.js';
import { cacheService } from '../services/cacheService.js';
import { config } from '../config/env.js';

const CART_TTL_SECONDS = 30 * 24 * 3600; // 30 days persistence in Redis

/**
 * Calculates cart totals with product-specific GST and shipping fees
 */
const calculateCartTotals = (items = []) => {
  let subtotal = 0;
  let taxPrice = 0;

  for (const item of items) {
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;
    const gstRate = item.gstRate !== undefined ? item.gstRate : config.currency.defaultGstPercent;
    const itemTax = Math.round(itemSubtotal * (gstRate / 100) * 100) / 100;
    taxPrice += itemTax;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  taxPrice = Math.round(taxPrice * 100) / 100;

  const freeShippingThreshold = config.currency.freeShippingThreshold;
  const shippingPrice = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : config.currency.defaultShippingFee;
  const totalPrice = Math.round((subtotal + shippingPrice + taxPrice) * 100) / 100;

  return {
    items,
    itemsCount: items.reduce((acc, it) => acc + it.quantity, 0),
    subtotal,
    taxPrice,
    shippingPrice,
    totalPrice,
    freeShippingThreshold,
    currency: 'INR',
  };
};

/**
 * Loads raw items for a user, using Redis first with MongoDB fallback
 */
const loadUserRawCartItems = async (userId) => {
  const cacheKey = `cart:${userId}`;
  const cached = await cacheService.get(cacheKey);

  if (cached && Array.isArray(cached.items)) {
    return cached.items;
  }

  const mongoCart = await Cart.findOne({ userId });
  if (mongoCart && mongoCart.items) {
    return mongoCart.items.map((it) => it.toObject());
  }

  return [];
};

/**
 * Persists raw cart items to both Redis and MongoDB
 */
const saveUserCartItems = async (userId, items) => {
  const cacheKey = `cart:${userId}`;
  const calculated = calculateCartTotals(items);

  // 1. Persist to MongoDB (durable store)
  await Cart.findOneAndUpdate(
    { userId },
    { items },
    { upsert: true, new: true }
  );

  // 2. Cache in Redis
  await cacheService.set(cacheKey, calculated, CART_TTL_SECONDS);

  return calculated;
};

/**
 * GET /api/v1/cart
 * Retrieves customer persistent cart, validating availability and prices against current catalog
 */
export const getCart = async (req, res, next) => {
  try {
    const rawItems = await loadUserRawCartItems(req.user._id);

    // Validate and refresh with current product data
    const refreshedItems = [];
    const warnings = [];

    for (const item of rawItems) {
      const product = await Product.findById(item.productId);
      if (!product || product.status !== 'published') {
        warnings.push(`"${item.title || 'An item'}" is no longer available.`);
        continue;
      }

      const availableStock = product.stock;
      if (availableStock === 0) {
        warnings.push(`"${product.title}" is currently out of stock.`);
        continue;
      }

      const quantity = Math.min(item.quantity, availableStock);
      if (quantity < item.quantity) {
        warnings.push(`Only ${availableStock} units of "${product.title}" are available.`);
      }

      const activePrice = product.discountPrice || product.price;

      refreshedItems.push({
        productId: product._id,
        title: product.title,
        price: activePrice,
        originalPrice: product.discountPrice ? product.price : null,
        image: product.images?.[0] || '',
        stock: product.stock,
        slug: product.slug,
        vendorId: product.vendorId,
        quantity,
        gstRate: product.gstRate !== undefined ? product.gstRate : config.currency.defaultGstPercent,
      });
    }

    const calculated = await saveUserCartItems(req.user._id, refreshedItems);

    res.status(200).json({
      success: true,
      data: {
        ...calculated,
        warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/cart/items
 * Adds product to customer cart
 */
export const addToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    const requestedQty = Math.max(1, parseInt(quantity, 10));
    const product = await Product.findById(productId);

    if (!product || product.status !== 'published') {
      return res.status(404).json({ success: false, message: 'Product is unavailable' });
    }

    if (product.stock < requestedQty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for "${product.title}". Available: ${product.stock}`,
      });
    }

    const rawItems = await loadUserRawCartItems(req.user._id);
    const existingIndex = rawItems.findIndex(
      (it) => it.productId.toString() === productId.toString()
    );

    const activePrice = product.discountPrice || product.price;
    const gstRate = product.gstRate !== undefined ? product.gstRate : config.currency.defaultGstPercent;

    if (existingIndex > -1) {
      const newQty = rawItems[existingIndex].quantity + requestedQty;
      if (newQty > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more units. Total in cart exceeds available stock (${product.stock})`,
        });
      }
      rawItems[existingIndex].quantity = newQty;
      rawItems[existingIndex].price = activePrice;
      rawItems[existingIndex].stock = product.stock;
    } else {
      rawItems.push({
        productId: product._id,
        title: product.title,
        price: activePrice,
        originalPrice: product.discountPrice ? product.price : null,
        image: product.images?.[0] || '',
        stock: product.stock,
        slug: product.slug,
        vendorId: product.vendorId,
        quantity: requestedQty,
        gstRate,
      });
    }

    const calculated = await saveUserCartItems(req.user._id, rawItems);

    res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: calculated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/cart/items/:id
 * Updates quantity of a specific cart item
 */
export const updateCartItem = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const { quantity } = req.body;

    const parsedQty = parseInt(quantity, 10);
    const rawItems = await loadUserRawCartItems(req.user._id);

    if (parsedQty <= 0) {
      // Remove item if quantity is zero or negative
      const filtered = rawItems.filter(
        (it) => it.productId.toString() !== productId.toString()
      );
      const calculated = await saveUserCartItems(req.user._id, filtered);
      return res.status(200).json({
        success: true,
        message: 'Item removed from cart',
        data: calculated,
      });
    }

    const itemIndex = rawItems.findIndex(
      (it) => it.productId.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      rawItems.splice(itemIndex, 1);
      const calculated = await saveUserCartItems(req.user._id, rawItems);
      return res.status(404).json({
        success: false,
        message: 'Product no longer exists. Removed from cart.',
        data: calculated,
      });
    }

    if (parsedQty > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} units available in stock`,
      });
    }

    rawItems[itemIndex].quantity = parsedQty;
    rawItems[itemIndex].price = product.discountPrice || product.price;
    rawItems[itemIndex].stock = product.stock;

    const calculated = await saveUserCartItems(req.user._id, rawItems);

    res.status(200).json({
      success: true,
      message: 'Cart quantity updated',
      data: calculated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/cart/items/:id
 * Removes an item from the customer cart
 */
export const removeCartItem = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const rawItems = await loadUserRawCartItems(req.user._id);

    const filtered = rawItems.filter(
      (it) => it.productId.toString() !== productId.toString()
    );

    const calculated = await saveUserCartItems(req.user._id, filtered);

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: calculated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/cart
 * Clears customer cart
 */
export const clearCart = async (req, res, next) => {
  try {
    const cacheKey = `cart:${req.user._id}`;
    await cacheService.del(cacheKey);
    await Cart.findOneAndUpdate({ userId: req.user._id }, { items: [] }, { upsert: true });

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: calculateCartTotals([]),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/cart/validate
 * Validates anonymous / guest cart items and recalculates product-specific GST
 */
export const validateCart = async (req, res, next) => {
  try {
    const { items = [] } = req.body;

    const validatedItems = [];
    let itemsPrice = 0;
    let totalTaxPrice = 0;
    const warnings = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || product.status !== 'published') {
        warnings.push(`Item "${item.title || item.productId}" is no longer available.`);
        continue;
      }

      const availableStock = product.stock;
      const requestedQty = Math.max(1, parseInt(item.quantity, 10));
      const adjustedQty = Math.min(requestedQty, availableStock);

      if (adjustedQty < requestedQty) {
        warnings.push(`Only ${availableStock} units of "${product.title}" are in stock.`);
      }

      if (availableStock === 0) {
        warnings.push(`"${product.title}" is currently out of stock.`);
        continue;
      }

      const activePrice = product.discountPrice || product.price;
      const itemSubtotal = activePrice * adjustedQty;
      itemsPrice += itemSubtotal;

      const gstRate = product.gstRate !== undefined ? product.gstRate : config.currency.defaultGstPercent;
      const itemTax = Math.round(itemSubtotal * (gstRate / 100) * 100) / 100;
      totalTaxPrice += itemTax;

      validatedItems.push({
        productId: product._id,
        title: product.title,
        price: activePrice,
        originalPrice: product.discountPrice ? product.price : null,
        image: product.images?.[0] || '',
        stock: product.stock,
        slug: product.slug,
        vendorId: product.vendorId,
        quantity: adjustedQty,
        gstRate,
      });
    }

    const freeShippingThreshold = config.currency.freeShippingThreshold;
    const shippingPrice = itemsPrice >= freeShippingThreshold || itemsPrice === 0 ? 0 : config.currency.defaultShippingFee;
    const subtotal = Math.round(itemsPrice * 100) / 100;
    const taxPrice = Math.round(totalTaxPrice * 100) / 100;
    const totalPrice = Math.round((subtotal + shippingPrice + taxPrice) * 100) / 100;

    res.status(200).json({
      success: true,
      data: {
        items: validatedItems,
        warnings,
        subtotal,
        shippingPrice,
        taxPrice,
        totalPrice,
        freeShippingThreshold,
        currency: 'INR',
      },
    });
  } catch (error) {
    next(error);
  }
};
