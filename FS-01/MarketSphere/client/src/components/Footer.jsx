import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ShieldCheck, Truck, RefreshCw, Headphones } from 'lucide-react';

export const Footer = () => {
  return (
    <footer style={{ backgroundColor: '#ffffff', borderTop: '1px solid var(--border)', marginTop: '4rem' }}>
      {/* Feature Value Props */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '2.5rem 0', backgroundColor: 'var(--bg-alt)' }}>
        <div className="container" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)'
            }}>
              <Truck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Free Express Shipping</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>On all orders over ₹999</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: '#dcfce7',
              color: '#15803d',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)'
            }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Buyer Protection</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>100% verified GST-registered vendors</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: '#fef3c7',
              color: '#b45309',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)'
            }}>
              <RefreshCw size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>7-Day Easy Returns</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Doorstep pickup across India</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: '#f3e8ff',
              color: '#7e22ce',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)'
            }}>
              <Headphones size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>24/7 Support</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Direct phone & live chat</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Links */}
      <div className="container" style={{ padding: '3.5rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}>
              <ShoppingBag size={18} />
            </div>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
              Market<span style={{ color: '#4f46e5' }}>Sphere</span>
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            India's premier multi-vendor e-commerce marketplace for authentic consumer electronics, designer apparel, and lifestyle essentials.
          </p>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>Shop & Discover</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <li><Link to="/products">All Products</Link></li>
            <li><Link to="/products?category=electronics">Electronics & Audio</Link></li>
            <li><Link to="/products?category=fashion">Fashion & Apparel</Link></li>
            <li><Link to="/products?category=home-living">Home & Living</Link></li>
          </ul>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>Sell on MarketSphere</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <li><Link to="/register">Register as Vendor</Link></li>
            <li><Link to="/vendor/dashboard">Vendor Portal</Link></li>
            <li><Link to="/docs">API & Integrations</Link></li>
          </ul>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>Customer Care</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <li><Link to="/orders">Track Orders</Link></li>
            <li><Link to="/cart">Shopping Bag</Link></li>
            <li><a href="#help">Help Center & FAQ</a></li>
            <li><a href="#privacy">Privacy & Terms</a></li>
          </ul>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '1.5rem 0', textAlign: 'center', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} MarketSphere India Pvt. Ltd. All prices shown in Indian Rupees (₹) inclusive of GST where applicable.
      </div>
    </footer>
  );
};
