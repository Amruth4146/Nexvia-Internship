import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar.jsx';
import { Footer } from '../components/Footer.jsx';
import { productService } from '../services/productService.js';

export const MainLayout = () => {
  const [categories, setCategories] = useState([]);
  const location = useLocation();

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const data = await productService.getCategories();
        if (Array.isArray(data)) {
          setCategories(data);
        }
      } catch (err) {
        // Fallback static categories if backend is offline
        setCategories([
          { slug: 'electronics', name: 'Electronics & Audio' },
          { slug: 'fashion', name: 'Fashion & Apparel' },
          { slug: 'home-living', name: 'Home & Living' },
          { slug: 'sports-outdoors', name: 'Sports & Outdoors' },
          { slug: 'books', name: 'Books & Stationery' },
        ]);
      }
    };
    fetchCats();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />

      {/* Sub-navigation Category Bar */}
      <nav style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', height: '44px' }}>
          <Link
            to="/products"
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: location.pathname === '/products' && !location.search ? 'var(--primary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            All Categories
          </Link>

          {categories.map((cat) => (
            <Link
              key={cat.slug}
              to={`/products?category=${cat.slug}`}
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: location.search.includes(`category=${cat.slug}`)
                  ? 'var(--primary)'
                  : 'var(--text-muted)',
                transition: 'color 0.15s ease',
              }}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </nav>

      {/* Page Content */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      <Footer />
    </div>
  );
};

