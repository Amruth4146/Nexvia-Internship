import { request } from './api.js';

export const authService = {
  login: async (email, password) => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.token) {
      localStorage.setItem('marketsphere_token', res.data.token);
      localStorage.setItem('marketsphere_refresh_token', res.data.refreshToken);
      localStorage.setItem('marketsphere_user', JSON.stringify(res.data.user));
    }
    return res.data;
  },

  register: async (userData) => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (res.data?.token) {
      localStorage.setItem('marketsphere_token', res.data.token);
      localStorage.setItem('marketsphere_refresh_token', res.data.refreshToken);
      localStorage.setItem('marketsphere_user', JSON.stringify(res.data.user));
    }
    return res.data;
  },

  refreshToken: async () => {
    const refreshToken = localStorage.getItem('marketsphere_refresh_token');
    if (!refreshToken) throw new Error('No refresh token');

    const res = await request('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    if (res.data?.token) {
      localStorage.setItem('marketsphere_token', res.data.token);
      localStorage.setItem('marketsphere_refresh_token', res.data.refreshToken);
    }
    return res.data;
  },

  getMe: async () => {
    const res = await request('/auth/me');
    return res.data?.user;
  },

  updateProfile: async (profileData) => {
    const res = await request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
    return res.data?.user;
  },

  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('marketsphere_token');
    localStorage.removeItem('marketsphere_refresh_token');
    localStorage.removeItem('marketsphere_user');
  },

  getCurrentUser: () => {
    const saved = localStorage.getItem('marketsphere_user');
    return saved ? JSON.parse(saved) : null;
  },
};
