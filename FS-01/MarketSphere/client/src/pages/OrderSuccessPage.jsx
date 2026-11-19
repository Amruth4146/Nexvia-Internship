import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Clock, Package, ArrowRight, ShieldCheck, AlertCircle, FileText, Download, X } from 'lucide-react';
import { orderService } from '../services/orderService.js';
import { paymentService } from '../services/paymentService.js';
import { useAuth } from '../context/AuthContext.jsx';

export const OrderSuccessPage = () => {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [pendingSimulation, setPendingSimulation] = useState(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const handleDownloadInvoice = async () => {
    setDownloadingInvoice(true);
    setInvoiceError('');
    try {
      await orderService.downloadOrderInvoice(order?._id || orderId);
    } catch (err) {
      setInvoiceError(err.message || 'Failed to download tax invoice');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const data = await orderService.getOrderById(orderId);
        if (data) {
          setOrder(data);
        }
      } catch (err) {
        console.warn('[Order Fetch Error]', err.message);
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const handlePayNow = async () => {
    if (!order) return;
    setPaying(true);
    setPayError('');
    try {
      const rzpData = await paymentService.createRazorpayOrder(order._id);
      const isLoaded = await paymentService.loadRazorpayScript();

      // Check if interactive Razorpay SDK is available and key is valid
      if (isLoaded && window.Razorpay && !paymentService.isMockKey(rzpData.keyId)) {
        const options = {
          key: rzpData.keyId,
          amount: rzpData.amount,
          currency: rzpData.currency || 'INR',
          name: 'MarketSphere India',
          description: `Order #${order.orderNumber || orderId}`,
          order_id: rzpData.razorpayOrderId,
          handler: async function (response) {
            try {
              setPaying(true);
              await paymentService.verifyPayment({
                orderId: order._id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              // Refetch updated order
              const updated = await orderService.getOrderById(orderId);
              setOrder(updated);
            } catch (vErr) {
              setPayError(vErr.message || 'Payment verification failed');
            } finally {
              setPaying(false);
            }
          },
          prefill: {
            name: order.shippingAddress?.fullName || user?.name,
            contact: order.shippingAddress?.phone || user?.phone,
            email: user?.email,
          },
          theme: { color: '#4f46e5' },
          modal: {
            ondismiss: function () {
              setPaying(false);
              setPayError('Payment popup was closed. Your order remains pending payment.');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          setPaying(false);
          setPayError(resp.error?.description || 'Payment was declined by bank or gateway.');
        });
        rzp.open();
        setPaying(false);
      } else {
        // Dev simulation mode strictly in local development
        if (import.meta.env.DEV) {
          setPendingSimulation({
            order,
            orderId: order._id,
            rzpData,
          });
        } else {
          setPayError('Payment gateway credentials are not configured in production. Please contact support.');
        }
        setPaying(false);
      }
    } catch (err) {
      setPayError(err.message || 'Payment initiation failed');
      setPaying(false);
    }
  };

  const handleSimulatedPaymentConfirm = async () => {
    if (!pendingSimulation || !import.meta.env.DEV) return;
    setVerifyingPayment(true);
    setPayError('');
    try {
      const { orderId: currentOrderId, rzpData } = pendingSimulation;
      const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await paymentService.verifyPayment({
        orderId: currentOrderId,
        razorpayOrderId: rzpData.razorpayOrderId,
        razorpayPaymentId: mockPaymentId,
        razorpaySignature: mockSignature,
      });

      setPendingSimulation(null);
      const updated = await orderService.getOrderById(orderId);
      setOrder(updated);
    } catch (err) {
      setPayError(err.message || 'Payment verification failed');
    } finally {
      setVerifyingPayment(false);
    }
  };

  const isPaid = order ? order.paymentStatus === 'paid' : searchParams.get('status') !== 'pending';

  return (
    <div className="container" style={{ padding: '5rem 1.5rem', textAlign: 'center', maxWidth: '640px' }}>
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        backgroundColor: isPaid ? '#dcfce7' : '#fef3c7',
        color: isPaid ? '#15803d' : '#b45309',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 1.5rem',
      }}>
        {isPaid ? <CheckCircle2 size={44} /> : <Clock size={44} />}
      </div>

      <span
        className={`badge ${isPaid ? 'badge-success' : 'badge-warning'}`}
        style={{
          marginBottom: '1rem',
          backgroundColor: isPaid ? '#dcfce7' : '#fef3c7',
          color: isPaid ? '#15803d' : '#b45309',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          fontWeight: 700,
          fontSize: '0.85rem',
        }}
      >
        {isPaid ? 'Order Confirmed & Paid' : 'Order Placed (Payment Pending)'}
      </span>

      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.75rem' }}>
        {isPaid ? 'Thank You for Your Order!' : 'Your Order Has Been Created!'}
      </h1>

      <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '2rem' }}>
        {isPaid
          ? 'We have received your payment and notified the merchant sellers. Your order invoice and tracking codes have been dispatched.'
          : 'Your order is currently awaiting payment completion. Complete payment below to begin fulfillment.'}
      </p>

      {payError && (
        <div style={{
          padding: '0.75rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          fontWeight: 600,
        }}>
          {payError}
        </div>
      )}

      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.5rem',
        marginBottom: '2rem',
        textAlign: 'left',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Order Reference:</span>
          <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>
            {order?.orderNumber || orderId || 'MS-CONFIRMED'}
          </strong>
        </div>

        {order?.totalPrice && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total Amount:</span>
            <strong style={{ fontSize: '1rem', color: 'var(--primary)' }}>
              ₹{order.totalPrice.toLocaleString('en-IN')}
            </strong>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Estimated Delivery:</span>
          <strong>3-5 Business Days (Express)</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Payment Status:</span>
          <span style={{
            color: isPaid ? 'var(--success)' : '#b45309',
            fontWeight: 800,
            textTransform: 'uppercase',
            fontSize: '0.9rem',
          }}>
            {order?.paymentStatus || (isPaid ? 'PAID' : 'PENDING')}
          </span>
        </div>
      </div>

      {!isPaid && (
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#1e40af', fontWeight: 700 }}>
            <ShieldCheck size={20} /> Complete Payment via Razorpay
          </div>
          <p style={{ fontSize: '0.875rem', color: '#3b82f6', marginBottom: '1.25rem' }}>
            Click below to authorize settlement for ₹{order?.totalPrice?.toLocaleString('en-IN') || ''}.
          </p>
          <button
            type="button"
            disabled={paying}
            onClick={handlePayNow}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', fontWeight: 700 }}
          >
            {paying ? 'Authorizing Payment...' : 'Pay Now with Razorpay (₹)'}
          </button>
        </div>
      )}

      {invoiceError && (
        <div style={{
          padding: '0.75rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          marginBottom: '1rem',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}>
          {invoiceError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={downloadingInvoice}
          onClick={handleDownloadInvoice}
          className="btn btn-outline"
          style={{ borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 700 }}
        >
          <FileText size={16} />
          {downloadingInvoice ? 'Generating Tax Invoice...' : 'Download Tax Invoice (PDF)'}
        </button>
        <Link to="/orders" className="btn btn-secondary">
          <Package size={16} /> View My Orders
        </Link>
        <Link to="/products" className="btn btn-primary">
          Continue Shopping <ArrowRight size={16} />
        </Link>
      </div>

      {/* Simulation Modal in Development Mode */}
      {pendingSimulation && import.meta.env.DEV && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            maxWidth: '440px',
            width: '100%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#eff6ff',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <ShieldCheck size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Razorpay Test Mode
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Simulating payment in local development environment.
            </p>

            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              marginBottom: '1.5rem',
              textAlign: 'left',
              fontSize: '0.875rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Order ID:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{pendingSimulation.order.orderNumber || pendingSimulation.orderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Razorpay Order ID:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{pendingSimulation.rzpData.razorpayOrderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ fontWeight: 700 }}>Total Payable:</span>
                <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>
                  ₹{(pendingSimulation.rzpData.amount / 100).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={verifyingPayment}
                onClick={handleSimulatedPaymentConfirm}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontWeight: 700 }}
              >
                {verifyingPayment ? 'Verifying...' : 'Confirm Test Payment (₹)'}
              </button>
              <button
                type="button"
                disabled={verifyingPayment}
                onClick={() => setPendingSimulation(null)}
                className="btn btn-outline"
                style={{ width: '100%', padding: '0.75rem', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
