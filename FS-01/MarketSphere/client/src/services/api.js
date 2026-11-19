const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export const request = async (endpoint, options = {}, isRetry = false) => {
  const token = localStorage.getItem('marketsphere_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    // If access token expired and we have a refresh token, attempt silent token refresh once
    if (
      response.status === 401 &&
      !isRetry &&
      !endpoint.includes('/auth/login') &&
      !endpoint.includes('/auth/refresh-token')
    ) {
      const refreshToken = localStorage.getItem('marketsphere_refresh_token');
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          const refreshData = await refreshRes.json();
          if (refreshRes.ok && refreshData.data?.token) {
            localStorage.setItem('marketsphere_token', refreshData.data.token);
            if (refreshData.data.refreshToken) {
              localStorage.setItem('marketsphere_refresh_token', refreshData.data.refreshToken);
            }
            // Retry original request with fresh token
            return await request(endpoint, options, true);
          }
        } catch (e) {
          // Token refresh failed - clear session
          localStorage.removeItem('marketsphere_token');
          localStorage.removeItem('marketsphere_refresh_token');
          localStorage.removeItem('marketsphere_user');
        }
      }
    }

    if (!response.ok) {
      const errorMsg =
        data.message ||
        (data.errors && data.errors.map((e) => e.message).join(', ')) ||
        `Request failed with status ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    console.error(`[API Request Error] ${endpoint}:`, error.message);
    throw error;
  }
};
