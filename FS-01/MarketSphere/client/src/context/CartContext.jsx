import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cartService } from '../services/cartService.js';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem('marketsphere_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [backendTotals, setBackendTotals] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [coupon, setCoupon] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const token = localStorage.getItem('marketsphere_token');

  // Sync with server cart when user is authenticated
  const syncServerCart = useCallback(async () => {
    const authToken = localStorage.getItem('marketsphere_token');
    if (!authToken) return;

    try {
      const data = await cartService.getCart();
      if (data && Array.isArray(data.items)) {
        setCartItems(data.items);
        setBackendTotals(data);
        if (data.warnings?.length) {
          setWarnings(data.warnings);
        }
      }
    } catch (err) {
      console.warn('[Cart Sync Warning]', err.message);
    }
  }, []);

  useEffect(() => {
    syncServerCart();
  }, [syncServerCart, token]);

  useEffect(() => {
    localStorage.setItem('marketsphere_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = async (product, quantity = 1) => {
    const pId = product._id || product.productId;
    const activePrice = product.discountPrice || product.price;
    const gstRate = product.gstRate !== undefined ? product.gstRate : 18;

    // Optimistic local update
    setCartItems((prev) => {
      const existing = prev.find((item) => item.productId === pId);
      if (existing) {
        return prev.map((item) =>
          item.productId === pId
            ? {
                ...item,
                quantity: Math.min(item.quantity + quantity, item.stock || 99),
              }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: pId,
          title: product.title,
          price: activePrice,
          originalPrice: product.discountPrice ? product.price : null,
          image: product.images?.[0] || product.image || '',
          stock: product.stock ?? 99,
          slug: product.slug,
          vendorId: product.vendorId?._id || product.vendorId || product.sellerId,
          quantity,
          gstRate,
        },
      ];
    });

    // If authenticated, persist to server
    const authToken = localStorage.getItem('marketsphere_token');
    if (authToken) {
      try {
        const res = await cartService.addToCart(pId, quantity);
        if (res && res.items) {
          setCartItems(res.items);
          setBackendTotals(res);
        }
      } catch (err) {
        console.warn('[Cart Persist Error]', err.message);
      }
    }
  };

  const removeFromCart = async (productId) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));

    const authToken = localStorage.getItem('marketsphere_token');
    if (authToken) {
      try {
        const res = await cartService.removeFromCart(productId);
        if (res && res.items) {
          setCartItems(res.items);
          setBackendTotals(res);
        }
      } catch (err) {
        console.warn('[Cart Remove Error]', err.message);
      }
    }
  };

  const updateQuantity = async (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(quantity, item.stock || 99) }
          : item
      )
    );

    const authToken = localStorage.getItem('marketsphere_token');
    if (authToken) {
      try {
        const res = await cartService.updateQuantity(productId, quantity);
        if (res && res.items) {
          setCartItems(res.items);
          setBackendTotals(res);
        }
      } catch (err) {
        console.warn('[Cart Update Quantity Error]', err.message);
      }
    }
  };

  const clearCart = async () => {
    setCartItems([]);
    setCoupon(null);
    setBackendTotals(null);

    const authToken = localStorage.getItem('marketsphere_token');
    if (authToken) {
      try {
        await cartService.clearCart();
      } catch (err) {
        console.warn('[Cart Clear Error]', err.message);
      }
    }
  };

  const applyCoupon = (couponData) => {
    setCoupon(couponData);
  };

  const removeCoupon = () => {
    setCoupon(null);
  };

  const FREE_SHIPPING_THRESHOLD_INR = 999;
  const DEFAULT_SHIPPING_FEE_INR = 99;

  const itemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const discountAmount = coupon?.discountAmount || 0;
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_INR || subtotal === 0 ? 0 : DEFAULT_SHIPPING_FEE_INR;

  // Product-specific GST calculation
  const tax = cartItems.reduce((acc, item) => {
    const rate = (item.gstRate !== undefined ? item.gstRate : 18) / 100;
    const itemSub = item.price * item.quantity;
    const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
    const taxableItemSub = Math.max(0, itemSub * (1 - discountRatio));
    return acc + Math.round(taxableItemSub * rate * 100) / 100;
  }, 0);

  const roundedTax = Math.round(tax * 100) / 100;
  const total = Math.round((taxableSubtotal + shipping + roundedTax) * 100) / 100;

  return (
    <CartContext.Provider
      value={{
        cartItems,
        itemsCount: backendTotals ? backendTotals.itemsCount : itemsCount,
        subtotal: backendTotals ? backendTotals.subtotal : subtotal,
        discountAmount,
        coupon,
        shipping: backendTotals ? backendTotals.shippingPrice : shipping,
        tax: backendTotals ? backendTotals.taxPrice : roundedTax,
        total: backendTotals ? backendTotals.totalPrice : total,
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD_INR,
        warnings,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        applyCoupon,
        removeCoupon,
        isCartOpen,
        setIsCartOpen,
        syncServerCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
