import { request } from './api.js';

export const userService = {
  getMyAddresses: async () => {
    const res = await request('/users/addresses');
    return res.data;
  },

  createAddress: async (addressData) => {
    const res = await request('/users/addresses', {
      method: 'POST',
      body: JSON.stringify(addressData),
    });
    return res.data;
  },

  updateAddress: async (id, addressData) => {
    const res = await request(`/users/addresses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(addressData),
    });
    return res.data;
  },

  deleteAddress: async (id) => {
    const res = await request(`/users/addresses/${id}`, {
      method: 'DELETE',
    });
    return res.data;
  },
};
