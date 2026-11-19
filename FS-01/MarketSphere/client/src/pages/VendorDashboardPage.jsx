import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  PlusCircle,
  Store,
  Check,
  AlertCircle,
  Package,
  TrendingUp,
  Clock,
  RefreshCw,
  Trash2,
  Truck,
  DollarSign,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { productService } from '../services/productService.js';
import { vendorService } from '../services/vendorService.js';
import { orderService } from '../services/orderService.js';

export const VendorDashboardPage = () => {
  const { user, isAuthenticated, isVendor, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [metrics, setMetrics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [vendorProducts, setVendorProducts] = useState([]);
  const [vendorOrders, setVendorOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Product Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryId: '',
    price: '',
    discountPrice: '',
    stock: '',
    sku: '',
    brand: '',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
    isFeatured: false,
  });
  const [submitting, setSubmitting] = useState(false);

  // Suborder tracking state
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);
  const [statusDrafts, setStatusDrafts] = useState({});

  const handleDownloadVendorInvoice = async (suborderId) => {
    setDownloadingInvoiceId(suborderId);
    setStatusMessage({ type: '', text: '' });
    try {
      await orderService.downloadVendorOrderInvoice(suborderId);
      setStatusMessage({ type: 'success', text: 'Merchant Tax Invoice downloaded successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to download suborder invoice' });
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const loadVendorData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);

    try {
      const [mRes, catRes, ordRes, prodRes] = await Promise.allSettled([
        vendorService.getVendorMetrics(),
        productService.getCategories(),
        orderService.getVendorOrders(),
        productService.getProducts({ limit: 100 }),
      ]);

      if (mRes.status === 'fulfilled' && mRes.value) {
        setMetrics(mRes.value.metrics || mRes.value);
      }
      if (catRes.status === 'fulfilled' && Array.isArray(catRes.value)) {
        setCategories(catRes.value);
        if (catRes.value.length > 0 && !formData.categoryId) {
          setFormData((prev) => ({ ...prev, categoryId: catRes.value[0]._id }));
        }
      }
      if (ordRes.status === 'fulfilled' && Array.isArray(ordRes.value)) {
        setVendorOrders(ordRes.value);
        // Initialize status drafts
        const drafts = {};
        ordRes.value.forEach((o) => {
          drafts[o._id] = {
            status: o.orderStatus || 'placed',
            trackingNumber: o.trackingNumber || '',
          };
        });
        setStatusDrafts(drafts);
      }
      if (prodRes.status === 'fulfilled' && prodRes.value?.products) {
        // Filter products belonging to this vendor
        const myProducts = prodRes.value.products.filter(
          (p) =>
            p.vendorId?._id === user?.id ||
            p.vendorId?._id === user?._id ||
            p.vendorId === user?.id ||
            p.vendorId === user?._id
        );
        setVendorProducts(myProducts.length > 0 ? myProducts : prodRes.value.products);
      }
    } catch (err) {
      console.warn('[Vendor Data Load Error]', err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, formData.categoryId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !isVendor) {
      navigate('/login?redirect=/vendor/dashboard');
      return;
    }
    loadVendorData();
  }, [authLoading, isAuthenticated, isVendor, navigate, loadVendorData]);

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        categoryId: formData.categoryId,
        price: parseFloat(formData.price),
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        stock: parseInt(formData.stock, 10),
        sku: formData.sku.toUpperCase(),
        brand: formData.brand,
        images: [formData.imageUrl],
        isFeatured: formData.isFeatured,
      };

      await productService.createProduct(payload);
      setStatusMessage({
        type: 'success',
        text: 'Product listed successfully in Indian Marketplace! It is now live.',
      });

      // Reset form
      setFormData({
        title: '',
        description: '',
        categoryId: categories[0]?._id || '',
        price: '',
        discountPrice: '',
        stock: '',
        sku: '',
        brand: '',
        imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        isFeatured: false,
      });

      await loadVendorData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to create product listing.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Are you sure you want to remove this product from marketplace?')) return;
    try {
      await productService.deleteProduct(productId);
      setStatusMessage({ type: 'success', text: 'Product removed from catalog.' });
      await loadVendorData();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete product.' });
    }
  };

  const handleUpdateSuborderStatus = async (suborderId) => {
    const draft = statusDrafts[suborderId];
    if (!draft) return;
    setUpdatingOrderId(suborderId);
    setStatusMessage({ type: '', text: '' });

    try {
      await orderService.updateVendorOrderStatus(suborderId, {
        status: draft.status,
        trackingNumber: draft.trackingNumber,
      });

      setStatusMessage({
        type: 'success',
        text: `Suborder updated to "${draft.status}" with tracking "${draft.trackingNumber || 'N/A'}"`,
      });
      await loadVendorData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to update suborder status.',
      });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <div className="container" style={{ padding: '3rem 1.5rem 5rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem' }}>
            <Store size={18} /> MERCHANT VENDOR PORTAL
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.25rem' }}>
            {user?.vendor?.businessName || user?.name || 'Vendor'} Dashboard
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={loadVendorData}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <Link to="/products" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            View Live Marketplace
          </Link>
        </div>
      </div>

      {statusMessage.text && (
        <div style={{
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: statusMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: statusMessage.type === 'success' ? '#15803d' : '#b91c1c',
          marginBottom: '1.5rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {statusMessage.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {statusMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border)',
        marginBottom: '2rem',
        overflowX: 'auto',
      }}>
        {[
          { id: 'overview', label: 'Overview & Metrics', icon: TrendingUp },
          { id: 'products', label: 'My Products', icon: Package, count: vendorProducts.length },
          { id: 'orders', label: 'Fulfillment Orders', icon: Truck, count: vendorOrders.length },
          { id: 'add', label: 'List New Product', icon: PlusCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setStatusMessage({ type: '', text: '' });
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
                <span style={{
                  backgroundColor: isActive ? 'var(--primary-light, #e0e7ff)' : 'var(--bg-muted, #f3f4f6)',
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Sales (INR)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--primary)' }}>
                ₹{metrics?.totalSalesINR?.toLocaleString('en-IN') || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Gross sales across orders
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Net Payout (INR)
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--success)' }}>
                ₹{metrics?.totalPayoutINR?.toLocaleString('en-IN') || '0'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                After 10% platform commission & GST
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Suborders Received
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>
                {metrics?.totalOrders || vendorOrders.length}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {metrics?.pendingOrders || 0} awaiting fulfillment
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Commission Rate
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#f59e0b' }}>
                {metrics?.commissionRate || user?.vendor?.commissionRate || 10}%
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Platform fee rate
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('add')}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <PlusCircle size={16} /> List New Product
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Truck size={16} /> Manage Suborders ({vendorOrders.length})
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Products List */}
      {activeTab === 'products' && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Listed Products ({vendorProducts.length})</h2>
            <button onClick={() => setActiveTab('add')} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              <PlusCircle size={14} /> Add Product
            </button>
          </div>

          {vendorProducts.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No products listed yet. Click "List New Product" to publish your first inventory item.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-alt)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Product</th>
                    <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Price</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Stock</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Rating</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorProducts.map((p) => (
                    <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <img
                          src={p.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100'}
                          alt={p.title}
                          onError={(e) => {
                            e.currentTarget.src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100' fill='%23f1f5f9'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui, sans-serif' font-size='10' fill='%2394a3b8'%3EItem%3C/text%3E%3C/svg%3E";
                          }}
                          style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
                        />
                        <span style={{ fontWeight: 600, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{p.sku}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>₹{p.price?.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontWeight: 600, color: p.stock < 5 ? 'var(--danger)' : 'inherit' }}>
                          {p.stock}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>★ {p.averageRating || '5.0'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className="badge badge-success">{p.status}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteProduct(p._id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: '0.4rem',
                          }}
                          title="Remove Product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Suborders & Fulfillment */}
      {activeTab === 'orders' && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Vendor Suborders ({vendorOrders.length})</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Manage shipping, fulfillment, and courier tracking numbers for merchant items.
            </p>
          </div>

          {vendorOrders.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No customer orders received yet. As customers check out your items, they will appear here.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-alt)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Suborder #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Items</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Total</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Net Payout</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Payment</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Fulfillment Status & Tracking</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorOrders.map((o) => {
                    const draft = statusDrafts[o._id] || { status: o.orderStatus, trackingNumber: o.trackingNumber || '' };
                    return (
                      <tr key={o._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>
                          {o.vendorOrderNumber}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600 }}>{o.customerId?.name || 'Customer'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.customerId?.phone}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {o.items?.map((it, idx) => (
                            <div key={idx} style={{ fontSize: '0.8rem' }}>
                              {it.quantity}x {it.title}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                          ₹{o.vendorTotal?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--success)' }}>
                          ₹{o.vendorPayoutAmount?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className={`badge ${o.paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                            {o.paymentStatus}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <select
                              value={draft.status}
                              onChange={(e) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [o._id]: { ...draft, status: e.target.value },
                                }))
                              }
                              style={{ padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8rem' }}
                            >
                              <option value="placed">placed</option>
                              <option value="processing">processing</option>
                              <option value="shipped">shipped</option>
                              <option value="delivered">delivered</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                            <input
                              type="text"
                              placeholder="AWB Tracking"
                              value={draft.trackingNumber}
                              onChange={(e) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [o._id]: { ...draft, trackingNumber: e.target.value },
                                }))
                              }
                              style={{ padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8rem', width: '110px' }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            disabled={updatingOrderId === o._id}
                            onClick={() => handleUpdateSuborderStatus(o._id)}
                            className="btn btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          >
                            {updatingOrderId === o._id ? 'Saving...' : 'Update'}
                          </button>
                          <button
                            type="button"
                            disabled={downloadingInvoiceId === o._id}
                            onClick={() => handleDownloadVendorInvoice(o._id)}
                            className="btn btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', marginLeft: '0.4rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                            title="Download Seller Tax Invoice (PDF)"
                          >
                            <FileText size={12} />
                            {downloadingInvoiceId === o._id ? '...' : 'Invoice'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Add Product Form */}
      {activeTab === 'add' && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: '2rem',
          boxShadow: 'var(--shadow-sm)',
          maxWidth: '800px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
            <PlusCircle size={22} color="var(--primary)" />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Create New Product Listing</h2>
          </div>

          <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Product Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sony WH-1000XM5 Wireless Headphones"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Category *
                </label>
                <select
                  required
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: '#fff' }}
                >
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Brand
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sony, Apple, Nike"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Unique SKU *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SONY-XM5-BLK"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Regular Price (₹ INR) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="29990"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Discount Price (₹ INR) (Optional)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="26990"
                  value={formData.discountPrice}
                  onChange={(e) => setFormData({ ...formData, discountPrice: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Inventory Units in Stock *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="50"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Product Image URL *
              </label>
              <input
                type="url"
                required
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Full Description *
              </label>
              <textarea
                rows={4}
                required
                placeholder="Highlight technical specifications, warranty terms, and unique selling points..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Feature this product on marketplace showcase</span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem' }}
            >
              {submitting ? 'Submitting Listing...' : 'Publish Listing to MarketSphere'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
