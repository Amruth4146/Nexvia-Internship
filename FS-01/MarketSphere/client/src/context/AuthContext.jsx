import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const initAuth = useCallback(async () => {
    const savedUser = authService.getCurrentUser();
    const token = localStorage.getItem('marketsphere_token');

    if (token && savedUser) {
      setUser(savedUser);
      try {
        const freshUser = await authService.getMe();
        if (freshUser) {
          setUser(freshUser);
          localStorage.setItem('marketsphere_user', JSON.stringify(freshUser));
        }
      } catch (err) {
        console.warn('Session verification failed, logging out');
        authService.logout();
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async (email, password) => {
    const data = await authService.login(email, password);
    setUser(data.user);
    return data.user;
  };

  const register = async (userData) => {
    const data = await authService.register(userData);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (e) {}
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        isCustomer: user?.role === 'customer',
        isVendor: user?.role === 'vendor' || user?.role === 'admin',
        isAdmin: user?.role === 'admin',
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
