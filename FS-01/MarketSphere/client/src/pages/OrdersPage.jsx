import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Calendar, CreditCard, ShieldCheck, FileText } from 'lucide-react';
import { orderService } from '../services/orderService.js';
import { paymentService } from '../services/paymentService.js';
import { useAuth } from '../context/AuthContext.jsx';

export const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [payMessage, setPayMessage] = useState({ type: '', text: '' });
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);
  const [invoiceError, setInvoiceError] = useState('');
  const { isAuthenticated } = useAuth();

  const handleDownloadInvoice = async (orderId) => {
    setDownloadingInvoiceId(orderId);
    setInvoiceError('');
    try {
      await orderService.downloadOrderInvoice(orderId);
    } catch (err) {
      setInvoiceError(err.message || 'Failed to download tax invoice');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await orderService.getMyOrders();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error('Failed to fetch orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const handlePayNow = async (order) => {
    setPayingOrderId(order._id);
    setPayMessage({ type: '', text: '' });
    try {
      const rzpData = await paymentService.createRazorpayOrder(order._id);
      const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await paymentService.verifyPayment({
        orderId: order._id,
        razorpayOrderId: rzpData.razorpayOrderId,
        razorpayPaymentId: mockPaymentId,
        razorpaySignature: mockSignature,
      });

      setPayMessage({
        type: 'success',
        text: `Order #${order.orderNumber} successfully paid!`,
      });
      await fetchOrders();
    } catch (err) {
      setPayMessage({
        type: 'error',
        text: err.message || 'Payment failed',
      });
    } finally {
      setPayingOrderId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: '6rem 1.5rem', textAlign: 'center' }}>
        <h2>Sign In to View Orders</h2>
        <p style={{ color: 'var(--text-muted)', margin: '1rem 0 2rem' }}>
          Please sign in to track and view your order history.
        </p>
        <Link to="/login" className="btn btn-primary">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '3rem 1.5rem 5rem' }}>
      <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '2rem' }}>
        My Orders ({orders.length})
      </h1>

      {payMessage.text && (
        <div style={{
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: payMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: payMessage.type === 'success' ? '#15803d' : '#b91c1c',
          marginBottom: '1.5rem',
          fontWeight: 600,
        }}>
          {payMessage.text}
        </div>
      )}

      {invoiceError && (
        <div style={{
          padding: '0.85rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          marginBottom: '1.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}>
          {invoiceError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          Loading your order history...
        </div>
      ) : orders.length === 0 ? (
        <div style={{
          backgroundColor: '#fff',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '5rem 2rem',
          textAlign: 'center',
        }}>
          <Package size={44} style={{ color: 'var(--text-light)', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>No orders placed yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            When you complete checkout on MarketSphere, your verified orders and merchant tracking codes will appear here.
          </p>
          <Link to="/products" className="btn btn-primary">
            Explore Marketplace
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {orders.map((order) => {
            const isPending = order.paymentStatus === 'pending';
            const isPaid = order.paymentStatus === 'paid';

            return (
              <div
                key={order._id || order.orderNumber}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.5rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {/* Header */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: '1.25rem',
                }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Order Number
                    </span>
                    <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1rem' }}>
                      {order.orderNumber}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <Calendar size={15} />
                    <span>{new Date(order.createdAt).toLocaleDateString('en-IN')}</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Total (INR)
                    </span>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>
                      ₹{order.totalPrice?.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'}`} style={{
                      backgroundColor: isPaid ? '#dcfce7' : '#fef3c7',
                      color: isPaid ? '#15803d' : '#b45309',
                    }}>
                      Payment: {order.paymentStatus || 'pending'}
                    </span>
                    <span className={`badge ${order.orderStatus === 'delivered' ? 'badge-success' : 'badge-primary'}`}>
                      Fulfillment: {order.orderStatus}
                    </span>

                    <button
                      type="button"
                      disabled={downloadingInvoiceId === order._id}
                      onClick={() => handleDownloadInvoice(order._id)}
                      className="btn btn-outline"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      title="Download GST Tax Invoice (PDF)"
                    >
                      <FileText size={14} />
                      {downloadingInvoiceId === order._id ? 'Generating...' : 'Tax Invoice (PDF)'}
                    </button>
                  </div>

                  {isPending && (
                    <button
                      type="button"
                      disabled={payingOrderId === order._id}
                      onClick={() => handlePayNow(order)}
                      className="btn btn-primary"
                      style={{ fontSize: '0.825rem', padding: '0.4rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <CreditCard size={14} />
                      {payingOrderId === order._id ? 'Processing...' : 'Pay Now'}
                    </button>
                  )}
                </div>

                {/* Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {order.items?.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: 'var(--radius-sm)',
                        overflow: 'hidden',
                        backgroundColor: 'var(--bg-alt)',
                        flexShrink: 0,
                      }}>
                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100'}
                          alt={item.title}
                          onError={(e) => {
                            e.currentTarget.src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100' fill='%23f1f5f9'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui, sans-serif' font-size='10' fill='%2394a3b8'%3EItem%3C/text%3E%3C/svg%3E";
                          }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.925rem' }}>{item.title}</div>
                        <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                          Qty: {item.quantity} × ₹{item.price?.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
