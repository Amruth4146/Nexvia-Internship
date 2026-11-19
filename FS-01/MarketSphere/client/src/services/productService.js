import { request } from './api.js';

export const productService = {
  getProducts: async (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const res = await request(`/products?${query.toString()}`);
    return res.data;
  },

  getFeatured: async () => {
    const res = await request('/products/featured');
    return res.data;
  },

  getProduct: async (identifier) => {
    const res = await request(`/products/${identifier}`);
    return res.data;
  },

  createProduct: async (productData) => {
    const res = await request('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
    return res.data;
  },

  updateProduct: async (productId, productData) => {
    const res = await request(`/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    });
    return res.data;
  },

  deleteProduct: async (productId) => {
    const res = await request(`/products/${productId}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  addReview: async (productId, reviewData) => {
    const res = await request(`/reviews/product/${productId}`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
    return res.data;
  },

  getCategories: async () => {
    const res = await request('/categories');
    return res.data;
  },

  validateCoupon: async (code, orderSubtotal) => {
    const res = await request('/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code, orderSubtotal }),
    });
    return res.data;
  },
};
