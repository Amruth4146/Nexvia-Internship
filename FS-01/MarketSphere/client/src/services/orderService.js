import { request } from './api.js';

export const orderService = {
  createOrder: async (orderPayload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await request('/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(orderPayload),
    });
    return res.data;
  },

  getMyOrders: async () => {
    const res = await request('/orders/my');
    return res.data;
  },

  getOrderById: async (id) => {
    const res = await request(`/orders/${id}`);
    return res.data;
  },

  getVendorOrders: async () => {
    const res = await request('/orders/vendor');
    return res.data;
  },

  updateVendorOrderStatus: async (id, { status, trackingNumber }) => {
    const res = await request(`/orders/vendor/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, trackingNumber }),
    });
    return res.data;
  },

  downloadOrderInvoice: async (orderId, suborderId = null) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    const token = localStorage.getItem('marketsphere_token');
    const query = suborderId ? `?suborderId=${encodeURIComponent(suborderId)}` : '';
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}/invoice${query}`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      credentials: 'include',
    });

    if (!res.ok) {
      let errorMsg = `Failed to download invoice (HTTP ${res.status})`;
      try {
        const json = await res.json();
        if (json.message) errorMsg = json.message;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : `Invoice-${orderId}.pdf`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },

  downloadVendorOrderInvoice: async (vendorOrderId) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    const token = localStorage.getItem('marketsphere_token');
    const res = await fetch(`${API_BASE_URL}/orders/vendor-orders/${vendorOrderId}/invoice`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      credentials: 'include',
    });

    if (!res.ok) {
      let errorMsg = `Failed to download vendor invoice (HTTP ${res.status})`;
      try {
        const json = await res.json();
        if (json.message) errorMsg = json.message;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : `Invoice-${vendorOrderId}.pdf`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },
};
