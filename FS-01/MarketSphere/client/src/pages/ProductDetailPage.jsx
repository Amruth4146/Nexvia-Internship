import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Star,
  ShieldCheck,
  Truck,
  RotateCcw,
  Check,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import { productService } from '../services/productService.js';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FALLBACK_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';
const SVG_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600' fill='%23f8fafc'%3E%3Crect width='600' height='600' fill='%23f8fafc'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui, sans-serif' font-size='18' fill='%2394a3b8'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

export const ProductDetailPage = () => {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { isAuthenticated } = useAuth();

  const [productData, setProductData] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [mainImgSrc, setMainImgSrc] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);

  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await productService.getProduct(identifier);
      setProductData(data);
      const initialImage = data?.product?.images?.[0] || FALLBACK_PRODUCT_IMAGE;
      setMainImgSrc(initialImage);
    } catch (err) {
      console.error('Failed to load product', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [identifier]);

  // Update main image source when thumbnail is selected
  useEffect(() => {
    if (productData?.product?.images?.[selectedImage]) {
      setMainImgSrc(productData.product.images[selectedImage]);
    }
  }, [selectedImage, productData]);

  const handleMainImageError = () => {
    if (mainImgSrc !== FALLBACK_PRODUCT_IMAGE) {
      setMainImgSrc(FALLBACK_PRODUCT_IMAGE);
    } else {
      setMainImgSrc(SVG_FALLBACK);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '5rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading product information...
      </div>
    );
  }

  const isNotFoundOrUnavailable =
    !productData?.product &&
    (error?.status === 404 ||
      error?.message?.toLowerCase().includes('not found') ||
      error?.message?.toLowerCase().includes('unavailable') ||
      !error);

  if (isNotFoundOrUnavailable) {
    return (
      <div className="container" style={{ padding: '5rem 1.5rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: '3rem 2rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
            Product Unavailable
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            This product is currently unavailable or has been removed from our marketplace catalog.
          </p>
          <Link to="/products" className="btn btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
            Return to Shopping
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ padding: '5rem 1.5rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid #fecaca',
          padding: '3rem 2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: '#b91c1c' }}>
            Unable to Load Product
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {error.message || 'An error occurred while communicating with the server.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button onClick={fetchDetail} className="btn btn-primary">
              Try Again
            </button>
            <Link to="/products" className="btn btn-secondary">
              Return to Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { product, reviews = [] } = productData;
  const isOutOfStock = typeof product.stock === 'number' && product.stock <= 0;
  const activePrice = product.discountPrice || product.price;
  const hasDiscount = product.discountPrice && product.discountPrice < product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
    : 0;

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addToCart(product, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    addToCart(product, quantity);
    navigate('/checkout');
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;
    setReviewSubmitting(true);
    try {
      await productService.addReview(product._id, {
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviewMessage('Thank you! Your verified review has been recorded.');
      setReviewComment('');
      const refreshed = await productService.getProduct(identifier);
      setProductData(refreshed);
    } catch (err) {
      setReviewMessage(err.message || 'Error submitting review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ padding: '3rem 1.5rem 5rem' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        <Link to="/">Home</Link> / <Link to="/products">Products</Link> /{' '}
        <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{product.title}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '3rem', alignItems: 'start' }}>
        {/* Images Gallery */}
        <div>
          <div style={{
            aspectRatio: '1',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1rem',
          }}>
            <img
              src={mainImgSrc || FALLBACK_PRODUCT_IMAGE}
              alt={product.title}
              onError={handleMainImageError}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* Thumbnails */}
          {product.images?.length > 1 && (
            <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto' }}>
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: selectedImage === idx ? '2px solid var(--primary)' : '1px solid var(--border)',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={img}
                    alt="Thumb"
                    onError={(e) => {
                      e.currentTarget.src = SVG_FALLBACK;
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Meta & Actions */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="badge badge-primary">{product.categoryId?.name || 'General'}</span>
            {product.brand && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>by {product.brand}</span>}
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            {product.title}
          </h1>

          {/* Rating & Stock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#f59e0b', fontWeight: 700 }}>
              <Star size={16} fill="#f59e0b" color="#f59e0b" />
              <span>{product.averageRating?.toFixed(1) || '0.0'}</span>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ({product.reviewCount || 0} reviews)
            </span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: isOutOfStock ? 'var(--danger)' : 'var(--success)'
            }}>
              {isOutOfStock ? 'Out of Stock' : `In Stock (${product.stock} units)`}
            </span>
          </div>

          {/* Pricing in INR */}
          <div style={{
            backgroundColor: '#ffffff',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                ₹{activePrice.toLocaleString('en-IN')}
              </span>
              {hasDiscount && (
                <>
                  <span style={{ fontSize: '1.1rem', color: 'var(--text-light)', textDecoration: 'line-through' }}>
                    ₹{product.price.toLocaleString('en-IN')}
                  </span>
                  <span className="badge badge-discount">Save {discountPercent}%</span>
                </>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Inclusive of all applicable Indian taxes (GST)
            </div>
          </div>

          <p style={{ color: 'var(--text-main)', lineHeight: '1.7', fontSize: '0.95rem', marginBottom: '1.75rem' }}>
            {product.description}
          </p>

          {/* Quantity and Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#fff',
            }}>
              <button
                disabled={isOutOfStock || quantity <= 1}
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{
                  padding: '0.6rem 0.9rem',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  opacity: isOutOfStock || quantity <= 1 ? 0.35 : 1,
                  cursor: isOutOfStock || quantity <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                -
              </button>
              <span style={{ padding: '0.6rem 0.9rem', fontWeight: 700, minWidth: '40px', textAlign: 'center' }}>
                {isOutOfStock ? 0 : quantity}
              </span>
              <button
                disabled={isOutOfStock || quantity >= product.stock}
                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                style={{
                  padding: '0.6rem 0.9rem',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  opacity: isOutOfStock || quantity >= product.stock ? 0.35 : 1,
                  cursor: isOutOfStock || quantity >= product.stock ? 'not-allowed' : 'pointer',
                }}
              >
                +
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className={`btn ${added ? 'btn-secondary' : isOutOfStock ? 'btn-secondary' : 'btn-primary'}`}
              style={{
                flex: 1,
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                opacity: isOutOfStock ? 0.65 : 1,
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
              }}
            >
              {isOutOfStock ? (
                'Out of Stock'
              ) : added ? (
                <>
                  <Check size={18} color="var(--success)" /> Added to Bag
                </>
              ) : (
                <>
                  <ShoppingCart size={18} /> Add to Cart
                </>
              )}
            </button>

            {!isOutOfStock && (
              <button
                onClick={handleBuyNow}
                className="btn btn-secondary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', backgroundColor: '#0f172a', color: '#fff' }}
              >
                <Zap size={18} color="#fbbf24" /> Buy Now
              </button>
            )}
          </div>

          {/* Trust Guarantees */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '1rem',
            padding: '1.25rem',
            backgroundColor: 'var(--bg-alt)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', fontWeight: 600 }}>
              <Truck size={16} color="var(--primary)" /> Free shipping over ₹999
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', fontWeight: 600 }}>
              <ShieldCheck size={16} color="var(--success)" /> GST Verified Seller
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', fontWeight: 600 }}>
              <RotateCcw size={16} color="var(--secondary)" /> 7-Day Easy Returns
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <section style={{ marginTop: '4rem', paddingTop: '3rem', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>
          Customer Reviews ({reviews.length})
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem' }}>
          <div>
            {reviews.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No customer reviews yet. Be the first to share your experience!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {reviews.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--primary-light)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                        }}>
                          {r.customerId?.name ? r.customerId.name[0] : 'C'}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.customerId?.name || 'Verified Customer'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.1rem', color: '#f59e0b' }}>
                        {[...Array(5)].map((_, idx) => (
                          <Star
                            key={idx}
                            size={14}
                            fill={idx < r.rating ? '#f59e0b' : 'none'}
                            color={idx < r.rating ? '#f59e0b' : '#cbd5e1'}
                          />
                        ))}
                      </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: '1.5' }}>{r.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Write a Review Box */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            alignSelf: 'start',
          }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>Rate this Product</h3>
            {isAuthenticated ? (
              <form onSubmit={handleReviewSubmit}>
                {reviewMessage && (
                  <div style={{
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '1rem',
                  }}>
                    {reviewMessage}
                  </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Rating Score:
                  </label>
                  <select
                    value={reviewRating}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <option value="5">⭐⭐⭐⭐⭐ 5 - Exceptional</option>
                    <option value="4">⭐⭐⭐⭐ 4 - Very Good</option>
                    <option value="3">⭐⭐⭐ 3 - Average</option>
                    <option value="2">⭐⭐ 2 - Poor</option>
                    <option value="1">⭐ 1 - Terrible</option>
                  </select>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Your Experience:
                  </label>
                  <textarea
                    rows={4}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Describe product quality, delivery, and performance..."
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  {reviewSubmitting ? 'Submitting...' : 'Post Verified Review'}
                </button>
              </form>
            ) : (
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Please sign in to write a customer review.
                </p>
                <Link to="/login" className="btn btn-outline" style={{ width: '100%' }}>
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
