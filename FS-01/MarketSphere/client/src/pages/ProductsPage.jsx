import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { productService } from '../services/productService.js';
import { ProductCard } from '../components/ProductCard.jsx';

export const ProductsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const activeCategory = searchParams.get('category') || '';
  const keyword = searchParams.get('keyword') || '';
  const sort = searchParams.get('sort') || 'newest';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';

  const [priceInput, setPriceInput] = useState({ min: minPrice, max: maxPrice });

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const cats = await productService.getCategories();
        if (Array.isArray(cats)) setCategories(cats);
      } catch (err) {}
    };
    fetchCats();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          keyword: searchParams.get('keyword') || '',
          category: searchParams.get('category') || '',
          sort: searchParams.get('sort') || 'newest',
          minPrice: searchParams.get('minPrice') || '',
          maxPrice: searchParams.get('maxPrice') || '',
          page: searchParams.get('page') || '1',
          limit: '12',
        };

        const res = await productService.getProducts(params);
        if (res?.products) {
          setProducts(res.products);
          setPagination(res.pagination);
        }
      } catch (err) {
        console.error('Error fetching products', err);
        setError(err.message || 'Failed to retrieve products');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [searchParams]);

  const updateParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (val) {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const handleApplyPrice = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (priceInput.min) next.set('minPrice', priceInput.min);
    else next.delete('minPrice');
    if (priceInput.max) next.set('maxPrice', priceInput.max);
    else next.delete('maxPrice');
    next.set('page', '1');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams({});
    setPriceInput({ min: '', max: '' });
  };

  return (
    <div className="container" style={{ padding: '2.5rem 1.5rem' }}>
      {/* Title & Toolbar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '2rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {keyword ? `Search Results for "${keyword}"` : activeCategory ? `${activeCategory.toUpperCase()} Products` : 'Marketplace Catalog'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Showing {products.length} of {pagination.total || products.length} available items
          </p>
        </div>

        {/* Sort Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sort By:</span>
          <select
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              backgroundColor: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="newest">Newest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Filters Sidebar */}
        <aside style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
              <Filter size={16} /> Filters
            </div>
            {(activeCategory || keyword || minPrice || maxPrice) && (
              <button
                onClick={clearFilters}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--primary)',
                }}
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>

          {/* Categories */}
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Category
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button
                onClick={() => updateParam('category', '')}
                style={{
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: !activeCategory ? 700 : 500,
                  color: !activeCategory ? 'var(--primary)' : 'var(--text-main)',
                  padding: '0.3rem 0',
                }}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => updateParam('category', c.slug)}
                  style={{
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: activeCategory === c.slug ? 700 : 500,
                    color: activeCategory === c.slug ? 'var(--primary)' : 'var(--text-muted)',
                    padding: '0.3rem 0',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range in INR */}
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Price Range (₹)
            </div>
            <form onSubmit={handleApplyPrice} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Min ₹"
                  value={priceInput.min}
                  onChange={(e) => setPriceInput({ ...priceInput, min: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: '0.85rem',
                  }}
                />
                <span style={{ color: 'var(--text-muted)' }}>-</span>
                <input
                  type="number"
                  placeholder="Max ₹"
                  value={priceInput.max}
                  onChange={(e) => setPriceInput({ ...priceInput, max: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
              <button type="submit" className="btn btn-secondary" style={{ width: '100%', padding: '0.45rem' }}>
                Apply Range
              </button>
            </form>
          </div>
        </aside>

        {/* Product Grid Area */}
        <main>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-muted)' }}>
              Loading products...
            </div>
          ) : error ? (
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid #fecaca',
                padding: '4rem 2rem',
                textAlign: 'center',
              }}
            >
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#b91c1c' }}>
                Unable to Retrieve Products
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                {error}
              </p>
              <button onClick={fetchProducts} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : products.length === 0 ? (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border)',
              padding: '4rem 2rem',
              textAlign: 'center',
            }}>
              <Search size={40} style={{ color: 'var(--text-light)', marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>No products found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Try adjusting your search terms or clearing your applied category/price filters.
              </p>
              <button onClick={clearFilters} className="btn btn-primary">
                Clear All Filters
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '1.5rem',
            }}>
              {products.map((p) => (
                <ProductCard key={p._id || p.slug} product={p} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
