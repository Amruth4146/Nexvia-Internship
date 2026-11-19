import { request } from './api.js';

export const cartService = {
  getCart: async () => {
    const res = await request('/cart');
    return res.data;
  },

  addToCart: async (productId, quantity = 1) => {
    const res = await request('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    });
    return res.data;
  },

  updateQuantity: async (productId, quantity) => {
    const res = await request(`/cart/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
    return res.data;
  },

  removeFromCart: async (productId) => {
    const res = await request(`/cart/items/${productId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  clearCart: async () => {
    const res = await request('/cart', {
      method: 'DELETE',
    });
    return res.data;
  },

  validateCart: async (items) => {
    const res = await request('/cart/validate', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    return res.data;
  },
};

