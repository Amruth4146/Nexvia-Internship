import { request } from './api.js';

export const adminService = {
  getDashboardMetrics: async () => {
    const res = await request('/admin/dashboard');
    return res.data;
  },

  getCommissionReports: async () => {
    const res = await request('/admin/commissions');
    return res.data;
  },

  getOrders: async () => {
    const res = await request('/admin/orders');
    return res.data;
  },

  updateVendorStatus: async (vendorId, statusData) => {
    const res = await request(`/admin/vendors/${vendorId}/status`, {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
    return res.data;
  },

  getUsers: async () => {
    const res = await request('/users');
    return res.data;
  },

  updateUserStatus: async (userId, data) => {
    const res = await request(`/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  getVendors: async () => {
    const res = await request('/vendors');
    return res.data;
  },

  getProducts: async () => {
    const res = await request('/products');
    return res.data;
  },

  deleteProduct: async (productId) => {
    const res = await request(`/products/${productId}`, {
      method: 'DELETE',
    });
    return res.data;
  },
};

