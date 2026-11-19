import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, TrendingUp, Store } from 'lucide-react';
import { productService } from '../services/productService.js';
import { ProductCard } from '../components/ProductCard.jsx';

export const HomePage = () => {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHomeData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [featRes, catRes] = await Promise.allSettled([
        productService.getFeatured(),
        productService.getCategories(),
      ]);

      if (featRes.status === 'fulfilled' && Array.isArray(featRes.value)) {
        setFeaturedProducts(featRes.value);
      } else if (featRes.status === 'rejected') {
        console.error('Featured products fetch failed:', featRes.reason);
        setError(featRes.reason?.message || 'Failed to load featured products');
      }

      if (catRes.status === 'fulfilled' && Array.isArray(catRes.value)) {
        setCategories(catRes.value);
      }
    } catch (err) {
      console.error('Failed to load home data', err);
      setError(err.message || 'Failed to connect to marketplace service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeData();
  }, []);

  return (
    <div>
      {/* Hero Banner */}
      <section
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          color: '#ffffff',
          padding: '4.5rem 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '3rem', alignItems: 'center' }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              padding: '0.4rem 0.9rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.825rem',
              fontWeight: 700,
              marginBottom: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}>
              <Sparkles size={16} color="#fbbf24" />
              <span>India's Verified Multi-Vendor Marketplace</span>
            </div>

            <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: '1.25rem' }}>
              Discover & Trade Extraordinary Goods.
            </h1>

            <p style={{ fontSize: '1.1rem', color: '#c7d2fe', lineHeight: 1.6, marginBottom: '2rem', maxWidth: '520px' }}>
              Direct access to verified GST-registered merchants, authentic electronics, and designer lifestyle products with built-in buyer protection.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <Link
                to="/products"
                className="btn"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#4338ca',
                  padding: '0.8rem 1.8rem',
                  fontSize: '1rem',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)',
                }}
              >
                Start Exploring <ArrowRight size={18} />
              </Link>
              <Link
                to="/register"
                className="btn btn-outline"
                style={{
                  color: '#ffffff',
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                  padding: '0.8rem 1.8rem',
                  fontSize: '1rem',
                }}
              >
                <Store size={18} /> Become a Vendor
              </Link>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: '100%',
                maxWidth: '460px',
                aspectRatio: '4/3',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <img
                src="https://images.unsplash.com/photo-1498049794561-7780e7231661?w=900&auto=format&fit=crop&q=80"
                alt="MarketSphere India"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="container" style={{ padding: '4rem 1.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Popular Categories</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>Browse high quality items grouped by category</p>
          </div>
          <Link to="/products" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>
            View All <ArrowRight size={16} />
          </Link>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1.25rem',
        }}>
          {[
            { name: 'Electronics & Audio', slug: 'electronics', icon: '🎧', count: '120+ Products' },
            { name: 'Fashion & Apparel', slug: 'fashion', icon: '👔', count: '240+ Products' },
            { name: 'Home & Living', slug: 'home-living', icon: '🛋️', count: '90+ Products' },
            { name: 'Sports & Fitness', slug: 'sports-fitness', icon: '⛺', count: '80+ Products' },
            { name: 'Books & Stationery', slug: 'books', icon: '📚', count: '150+ Products' },
          ].map((cat) => (
            <Link
              key={cat.slug}
              to={`/products?category=${cat.slug}`}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem 1.25rem',
                textAlign: 'center',
                transition: 'all 0.2s ease',
                boxShadow: 'var(--shadow-sm)',
                display: 'block',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: '2.2rem', marginBottom: '0.6rem' }}>{cat.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{cat.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{cat.count}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="container" style={{ padding: '3rem 1.5rem 4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
              <TrendingUp size={16} /> Hand-Picked Highlights
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '0.2rem' }}>
              Featured Marketplace Arrivals
            </h2>
          </div>
          <Link to="/products" className="btn btn-secondary">
            Explore All Listings
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            Loading hand-picked marketplace highlights...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '2rem',
              backgroundColor: '#fef2f2',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #fecaca',
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#b91c1c', fontWeight: 600, marginBottom: '1rem' }}>
              {error}
            </p>
            <button onClick={loadHomeData} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : featuredProducts.length === 0 ? (
          <div
            style={{
              padding: '3rem 2rem',
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border)',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              No featured arrivals currently highlighted. Explore our full catalog to discover authentic products.
            </p>
            <Link to="/products" className="btn btn-primary">
              Browse All Products
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {featuredProducts.map((product) => (
              <ProductCard key={product._id || product.slug} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
