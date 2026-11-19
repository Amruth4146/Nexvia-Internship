import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CreditCard, Lock, ArrowLeft, QrCode, MapPin, Plus, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { orderService } from '../services/orderService.js';
import { paymentService } from '../services/paymentService.js';
import { userService } from '../services/userService.js';

export const CheckoutPage = () => {
  const { cartItems, subtotal, discountAmount, coupon, shipping, tax, total, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('custom');

  const [address, setAddress] = useState({
    fullName: user?.name || '',
    phone: user?.phone || '9876543210',
    street: 'Flat 402, Trade Tower, Lower Parel',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400013',
    country: 'India',
  });

  const [saveToProfile, setSaveToProfile] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('razorpay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Payment modal state (for test/dev simulation or review)
  const [pendingPaymentData, setPendingPaymentData] = useState(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchAddresses = async () => {
      try {
        const addresses = await userService.getMyAddresses();
        if (Array.isArray(addresses) && addresses.length > 0) {
          setSavedAddresses(addresses);
          const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
          setSelectedAddressId(defaultAddr._id);
          setAddress({
            fullName: defaultAddr.fullName || user?.name || '',
            phone: defaultAddr.phone || user?.phone || '',
            street: defaultAddr.street || '',
            city: defaultAddr.city || '',
            state: defaultAddr.state || 'Maharashtra',
            postalCode: defaultAddr.postalCode || '',
            country: defaultAddr.country || 'India',
          });
        }
      } catch (err) {
        console.warn('[Address Fetch Warning]', err.message);
      }
    };

    fetchAddresses();
  }, [isAuthenticated, user]);

  const handleSelectSavedAddress = (addr) => {
    setSelectedAddressId(addr._id);
    setAddress({
      fullName: addr.fullName || user?.name || '',
      phone: addr.phone || user?.phone || '',
      street: addr.street || '',
      city: addr.city || '',
      state: addr.state || 'Maharashtra',
      postalCode: addr.postalCode || '',
      country: addr.country || 'India',
    });
  };

  if (cartItems.length === 0 && !pendingPaymentData) {
    return (
      <div className="container" style={{ padding: '5rem 0', textAlign: 'center' }}>
        <h2>Your bag is empty</h2>
        <Link to="/products" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Browse Marketplace
        </Link>
      </div>
    );
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login?redirect=/checkout');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Save address if requested
      if (selectedAddressId === 'custom' && saveToProfile) {
        try {
          await userService.createAddress(address);
        } catch (addrErr) {
          console.warn('[Address Save Warning]', addrErr.message);
        }
      }

      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `ms_idemp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const orderPayload = {
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        shippingAddress: address,
        paymentMethod,
        couponCode: coupon?.code || undefined,
      };

      const createdOrder = await orderService.createOrder(orderPayload, idempotencyKey);
      const orderId = createdOrder._id || createdOrder.id;

      if (paymentMethod === 'cod') {
        clearCart();
        navigate(`/order-success/${orderId}`);
        return;
      }

      // Razorpay Payment Flow
      const rzpData = await paymentService.createRazorpayOrder(orderId);
      const isLoaded = await paymentService.loadRazorpayScript();

      // Check if interactive Razorpay SDK is available and key is valid
      if (isLoaded && window.Razorpay && !paymentService.isMockKey(rzpData.keyId)) {
        const options = {
          key: rzpData.keyId,
          amount: rzpData.amount,
          currency: rzpData.currency || 'INR',
          name: 'MarketSphere India',
          description: `Order #${createdOrder.orderNumber || orderId}`,
          order_id: rzpData.razorpayOrderId,
          handler: async function (response) {
            try {
              setVerifyingPayment(true);
              await paymentService.verifyPayment({
                orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              clearCart();
              navigate(`/order-success/${orderId}`);
            } catch (vErr) {
              setError(vErr.message || 'Payment verification failed');
            } finally {
              setVerifyingPayment(false);
            }
          },
          prefill: {
            name: address.fullName,
            contact: address.phone,
            email: user?.email,
          },
          theme: { color: '#4f46e5' },
          modal: {
            ondismiss: function () {
              clearCart();
              navigate(`/order-success/${orderId}?status=pending`);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          setError(resp.error?.description || 'Payment was declined by bank or gateway');
          clearCart();
          navigate(`/order-success/${orderId}?status=pending`);
        });
        rzp.open();
        setLoading(false);
      } else {
        // Dev / Test simulation modal for Razorpay payment (strictly disabled in production)
        if (import.meta.env.DEV) {
          setPendingPaymentData({
            order: createdOrder,
            orderId,
            rzpData,
          });
        } else {
          setError('Payment gateway is not configured for live payments. Please contact support.');
          clearCart();
          navigate(`/order-success/${orderId}?status=pending`);
        }
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to place order. Please review your details.');
      setLoading(false);
    }
  };

  const handleSimulatedPaymentConfirm = async () => {
    if (!pendingPaymentData || !import.meta.env.DEV) return;
    setVerifyingPayment(true);
    setError('');

    try {
      const { orderId, rzpData } = pendingPaymentData;
      const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const mockSignature = `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await paymentService.verifyPayment({
        orderId,
        razorpayOrderId: rzpData.razorpayOrderId,
        razorpayPaymentId: mockPaymentId,
        razorpaySignature: mockSignature,
      });

      clearCart();
      navigate(`/order-success/${orderId}`);
    } catch (err) {
      setError(err.message || 'Payment verification failed.');
    } finally {
      setVerifyingPayment(false);
    }
  };

  const handlePayLater = () => {
    if (!pendingPaymentData) return;
    clearCart();
    navigate(`/order-success/${pendingPaymentData.orderId}?status=pending`);
  };

  return (
    <div className="container" style={{ padding: '3rem 1.5rem 5rem' }}>
      <Link to="/cart" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        <ArrowLeft size={16} /> Return to Shopping Bag
      </Link>

      <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '2rem' }}>Checkout & Payment</h1>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
          fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {/* Payment Confirmation Modal / Card if pending simulation */}
      {pendingPaymentData && (
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
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 'var(--radius-lg)',
            padding: '2.5rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#e0e7ff',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}>
                <ShieldCheck size={32} />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Razorpay Payment Gateway</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Secure Payment Authorization (INR ₹)
              </p>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-alt)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Order ID:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{pendingPaymentData.order.orderNumber || pendingPaymentData.orderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Razorpay Order ID:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{pendingPaymentData.rzpData.razorpayOrderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ fontWeight: 700 }}>Total Payable:</span>
                <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>
                  ₹{(pendingPaymentData.rzpData.amount / 100).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={verifyingPayment}
                onClick={handleSimulatedPaymentConfirm}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', fontWeight: 700 }}
              >
                {verifyingPayment ? 'Verifying Gateway Signature...' : 'Authorize & Complete Payment (₹)'}
              </button>
              <button
                type="button"
                disabled={verifyingPayment}
                onClick={handlePayLater}
                className="btn btn-outline"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}
              >
                Save Order & Pay Later
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handlePlaceOrder} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem', alignItems: 'start' }}>
        {/* Shipping & Payment Form */}
        <div>
          {/* Shipping Address in India */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            padding: '1.75rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>1. Delivery Address (India)</h2>
              {savedAddresses.length > 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {savedAddresses.length} saved address(es)
                </span>
              )}
            </div>

            {/* Saved Address Cards */}
            {savedAddresses.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {savedAddresses.map((addr) => {
                  const isSelected = selectedAddressId === addr._id;
                  return (
                    <div
                      key={addr._id}
                      onClick={() => handleSelectSavedAddress(addr)}
                      style={{
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'var(--primary-light, #e0e7ff15)' : '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                      }}
                    >
                      <input
                        type="radio"
                        name="address_choice"
                        checked={isSelected}
                        onChange={() => handleSelectSavedAddress(addr)}
                        style={{ marginTop: '0.2rem' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          {addr.fullName} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>({addr.phone})</span>
                          {addr.isDefault && <span className="badge badge-primary" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>Default</span>}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {addr.street}, {addr.city}, {addr.state} - {addr.postalCode}, {addr.country}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedAddressId('custom');
                    setAddress({
                      fullName: user?.name || '',
                      phone: user?.phone || '',
                      street: '',
                      city: '',
                      state: 'Maharashtra',
                      postalCode: '',
                      country: 'India',
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'none',
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: selectedAddressId === 'custom' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={16} /> Enter a different shipping address
                </button>
              </div>
            )}

            {/* Custom Address Input Fields */}
            {(selectedAddressId === 'custom' || savedAddresses.length === 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={address.fullName}
                      onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      10-Digit Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      pattern="[6-9][0-9]{9}"
                      placeholder="98XXXXXXXX"
                      value={address.phone}
                      onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Flat / House / Street Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      6-Digit PIN Code *
                    </label>
                    <input
                      type="text"
                      required
                      pattern="[1-9][0-9]{5}"
                      placeholder="400001"
                      value={address.postalCode}
                      onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Country
                    </label>
                    <input
                      type="text"
                      disabled
                      value="India"
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-alt)',
                      }}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={saveToProfile}
                    onChange={(e) => setSaveToProfile(e.target.checked)}
                  />
                  <span style={{ fontSize: '0.875rem' }}>Save this address to my profile for faster checkout</span>
                </label>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            padding: '1.75rem',
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.25rem' }}>2. Payment Options</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem',
                border: paymentMethod === 'razorpay' ? '2px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'razorpay'}
                  onChange={() => setPaymentMethod('razorpay')}
                />
                <CreditCard size={18} color="var(--primary)" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Razorpay (Cards, UPI, Netbanking, Wallets)</span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem',
                border: paymentMethod === 'cod' ? '2px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                />
                <QrCode size={18} color="#059669" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Cash on Delivery (COD)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Order Items & Place CTA */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.25rem' }}>Order Breakdown</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem', maxHeight: '240px', overflowY: 'auto' }}>
            {cartItems.map((item) => (
              <div key={item.productId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.quantity}x {item.title}
                </span>
                <span style={{ fontWeight: 700 }}>₹{(item.price * item.quantity).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Items Subtotal</span>
              <span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                <span>Coupon Applied</span>
                <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Shipping (Express India)</span>
              <span>{shipping === 0 ? 'FREE' : `₹${shipping.toLocaleString('en-IN')}`}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>GST (18%)</span>
              <span>₹{tax.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)' }}>
              <span>Total Payable</span>
              <span>₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', marginBottom: '1rem' }}
          >
            {loading ? 'Processing Order...' : `Confirm Order for ₹${total.toLocaleString('en-IN')}`}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Lock size={14} color="var(--success)" /> Verified Razorpay Payment Gateway
          </div>
        </div>
      </form>
    </div>
  );
};
