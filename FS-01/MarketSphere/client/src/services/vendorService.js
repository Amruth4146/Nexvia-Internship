import { request } from './api.js';

export const vendorService = {
  getVendorMetrics: async () => {
    const res = await request('/vendors/dashboard/metrics');
    return res.data;
  },

  updateVendorProfile: async (profileData) => {
    const res = await request('/vendors/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
    return res.data;
  },

  getVendorByIdentifier: async (identifier) => {
    const res = await request(`/vendors/${identifier}`);
    return res.data;
  },

  getVendors: async () => {
    const res = await request('/vendors');
    return res.data;
  },
};

