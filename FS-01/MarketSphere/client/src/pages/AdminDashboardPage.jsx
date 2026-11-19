import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  Store,
  Package,
  ShoppingBag,
  Percent,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { adminService } from '../services/adminService.js';

export const AdminDashboardPage = () => {
  const { user, isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [metrics, setMetrics] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [commissionsList, setCommissionsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

  // Route protection
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      navigate('/login?redirect=/admin/dashboard');
    }
  }, [authLoading, isAuthenticated, isAdmin, navigate]);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [m, u, v, p, o, c] = await Promise.allSettled([
        adminService.getDashboardMetrics(),
        adminService.getUsers(),
        adminService.getVendors(),
        adminService.getProducts(),
        adminService.getOrders(),
        adminService.getCommissionReports(),
      ]);

      if (m.status === 'fulfilled') setMetrics(m.value);
      if (u.status === 'fulfilled') setUsersList(u.value.users || u.value);
      if (v.status === 'fulfilled') setVendorsList(v.value.vendors || v.value);
      if (p.status === 'fulfilled') setProductsList(p.value.products || p.value);
      if (o.status === 'fulfilled') setOrdersList(o.value);
      if (c.status === 'fulfilled') setCommissionsList(c.value);
    } catch (err) {
      console.error('[Admin Data Load Error]', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleUserStatus = async (userId, currentStatus) => {
    try {
      await adminService.updateUserStatus(userId, { isActive: !currentStatus });
      setActionMessage({ type: 'success', text: 'User status updated successfully' });
      loadData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateVendor = async (vendorId, status) => {
    try {
      await adminService.updateVendorStatus(vendorId, { status });
      setActionMessage({ type: 'success', text: `Vendor marked as ${status}` });
      loadData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Are you sure you want to remove this product?')) return;
    try {
      await adminService.deleteProduct(productId);
      setActionMessage({ type: 'success', text: 'Product removed from catalog' });
      loadData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <RefreshCw size={36} className="spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-muted)' }}>Loading Admin Portal...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2.5rem 1rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <ShieldCheck size={28} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Admin Platform Console</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            MarketSphere Multi-Vendor Oversight & Indian Retail Governance
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {actionMessage.text && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            backgroundColor: actionMessage.type === 'error' ? 'var(--danger-light, #fee2e2)' : 'var(--success-light, #dcfce7)',
            color: actionMessage.type === 'error' ? 'var(--danger, #ef4444)' : 'var(--success, #16a34a)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {actionMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border)',
          marginBottom: '2rem',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'users', label: 'Users', icon: Users, count: usersList.length },
          { id: 'vendors', label: 'Vendors', icon: Store, count: vendorsList.length },
          { id: 'products', label: 'Products', icon: Package, count: productsList.length },
          { id: 'orders', label: 'Orders', icon: ShoppingBag, count: ordersList.length },
          { id: 'commissions', label: 'Commissions', icon: Percent, count: commissionsList.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setActionMessage({ type: '', text: '' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                fontSize: '0.9rem',
              }}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  style={{
                    backgroundColor: isActive ? 'var(--primary-light, #e0e7ff)' : 'var(--bg-muted, #f3f4f6)',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Total GMV (INR)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)' }}>
                ₹{(metrics?.totalGMV_INR || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Platform Commissions</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success, #16a34a)' }}>
                ₹{(metrics?.totalPlatformCommission_INR || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Registered Users</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{metrics?.totalUsers || usersList.length}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Active Vendors</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{metrics?.totalVendors || vendorsList.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-muted, #f9fafb)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Email</th>
                <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => (
                <tr key={u._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{u.name}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{u.email}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'vendor' ? 'badge-secondary' : 'badge-outline'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ color: u.isActive !== false ? 'var(--success, #16a34a)' : 'var(--danger, #ef4444)', fontWeight: 600 }}>
                      {u.isActive !== false ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handleToggleUserStatus(u._id, u.isActive !== false)}
                        className="btn btn-outline"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        {u.isActive !== false ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-muted, #f9fafb)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Store Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>GSTIN</th>
                <th style={{ padding: '0.75rem 1rem' }}>Commission</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendorsList.map((v) => (
                <tr key={v._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{v.businessName}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{v.gstin || 'Pending'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{v.commissionRate || 10}%</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${v.status === 'approved' ? 'badge-primary' : v.status === 'suspended' ? 'badge-danger' : 'badge-outline'}`}>
                      {v.status || 'approved'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {v.status !== 'approved' && (
                        <button
                          onClick={() => handleUpdateVendor(v._id, 'approved')}
                          className="btn btn-primary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          Approve
                        </button>
                      )}
                      {v.status !== 'suspended' && (
                        <button
                          onClick={() => handleUpdateVendor(v._id, 'suspended')}
                          className="btn btn-outline"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger, #ef4444)' }}
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-muted, #f9fafb)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Product</th>
                <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
                <th style={{ padding: '0.75rem 1rem' }}>Price (INR)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Stock</th>
                <th style={{ padding: '0.75rem 1rem' }}>GST</th>
                <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {productsList.map((p) => (
                <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{p.title}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{p.sku || '-'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>₹{(p.price || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{p.stock}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{p.gstRate !== undefined ? `${p.gstRate}%` : '18%'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <button
                      onClick={() => handleDeleteProduct(p._id)}
                      className="btn btn-outline"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger, #ef4444)' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-muted, #f9fafb)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Order Number</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Payment</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ordersList.map((o) => (
                <tr key={o._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>{o.orderNumber}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{o.customerId?.name || 'Customer'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>₹{(o.totalPrice || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${o.paymentStatus === 'paid' ? 'badge-primary' : 'badge-outline'}`}>
                      {o.paymentStatus}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-secondary">{o.orderStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Commissions Tab */}
      {activeTab === 'commissions' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-muted, #f9fafb)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Vendor</th>
                <th style={{ padding: '0.75rem 1rem' }}>Gross Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Take Rate</th>
                <th style={{ padding: '0.75rem 1rem' }}>Commission (INR)</th>
                <th style={{ padding: '0.75rem 1rem' }}>GST on Comm (18%)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Net Payout</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {commissionsList.map((c) => (
                <tr key={c._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{c.vendorId?.name || 'Vendor'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>₹{(c.grossAmount || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{c.commissionRate}%</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--success, #16a34a)' }}>
                    ₹{(c.commissionAmount || 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>₹{(c.gstOnCommission || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>₹{(c.netVendorPayout || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${c.status === 'paid' ? 'badge-primary' : 'badge-outline'}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

