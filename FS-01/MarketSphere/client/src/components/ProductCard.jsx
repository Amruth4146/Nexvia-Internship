import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, ShoppingCart, Check } from 'lucide-react';
import { useCart } from '../context/CartContext.jsx';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80';
const SVG_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%23f1f5f9'%3E%3Crect width='400' height='300' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui, sans-serif' font-size='14' fill='%2394a3b8'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

export const ProductCard = ({ product }) => {
  const { addToCart } = useCart();
  const [added, setAdded] = useState(false);
  const [imgSrc, setImgSrc] = useState(
    product.images?.[0] || FALLBACK_IMAGE
  );

  const isOutOfStock = typeof product.stock === 'number' && product.stock <= 0;
  const activePrice = product.discountPrice || product.price;
  const hasDiscount = product.discountPrice && product.discountPrice < product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
    : 0;

  const handleImageError = () => {
    if (imgSrc !== FALLBACK_IMAGE) {
      setImgSrc(FALLBACK_IMAGE);
    } else {
      setImgSrc(SVG_FALLBACK);
    }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (isOutOfStock) return;
    addToCart(product, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.25s ease',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      {/* Product Image */}
      <Link
        to={`/products/${product.slug || product._id}`}
        style={{
          position: 'relative',
          paddingTop: '80%',
          backgroundColor: '#f8fafc',
          overflow: 'hidden',
          display: 'block',
        }}
      >
        <img
          src={imgSrc}
          alt={product.title}
          onError={handleImageError}
          loading="lazy"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.4s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        />

        {isOutOfStock ? (
          <span
            className="badge"
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 2,
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontWeight: 800,
            }}
          >
            Out of Stock
          </span>
        ) : hasDiscount ? (
          <span
            className="badge badge-discount"
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 2,
              fontWeight: 800,
            }}
          >
            -{discountPercent}%
          </span>
        ) : product.isFeatured ? (
          <span
            className="badge badge-primary"
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 2,
            }}
          >
            Featured
          </span>
        ) : null}
      </Link>

      {/* Product Details */}
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
            {product.categoryId?.name || 'Item'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>
            <Star size={13} fill="#f59e0b" color="#f59e0b" />
            <span>{product.averageRating?.toFixed(1) || '0.0'}</span>
            <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>({product.reviewCount || 0})</span>
          </div>
        </div>

        <Link
          to={`/products/${product.slug || product._id}`}
          style={{
            fontWeight: 700,
            fontSize: '0.975rem',
            lineHeight: 1.35,
            color: 'var(--text-main)',
            marginBottom: '0.75rem',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '2.7rem',
          }}
        >
          {product.title}
        </Link>

        {/* Pricing in INR */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              ₹{activePrice.toLocaleString('en-IN')}
            </div>
            {hasDiscount && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', textDecoration: 'line-through' }}>
                ₹{product.price.toLocaleString('en-IN')}
              </div>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={isOutOfStock}
            className={`btn ${added ? 'btn-secondary' : isOutOfStock ? 'btn-secondary' : 'btn-primary'}`}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              opacity: isOutOfStock ? 0.65 : 1,
              cursor: isOutOfStock ? 'not-allowed' : 'pointer',
            }}
          >
            {isOutOfStock ? (
              'Out of Stock'
            ) : added ? (
              <>
                <Check size={16} color="var(--success)" /> Added
              </>
            ) : (
              <>
                <ShoppingCart size={16} /> Add
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
