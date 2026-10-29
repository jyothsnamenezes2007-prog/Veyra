import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw, Filter, SlidersHorizontal, ArrowUpDown, X, ShoppingBag, Sparkles } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { ProductQuickViewModal } from '../components/ProductQuickViewModal';
import { useProducts } from '../context/ProductsContext';

export const Explore = () => {
  const { products, categories } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search query from URL or state
  const initialCategory = searchParams.get('category') || 'all';
  const initialSearch = searchParams.get('search') || '';

  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [sortBy, setSortBy] = useState('featured');
  const [priceRange, setPriceRange] = useState('all'); // 'all', 'under-15k', '15k-30k', 'above-30k'
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  // Sync state when URL params change
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) setActiveCategory(cat);
    const q = searchParams.get('search');
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);

  // Handle category tab change
  const handleCategorySelect = (catId) => {
    setActiveCategory(catId);
    if (catId === 'all') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', catId);
    }
    setSearchParams(searchParams);
  };

  const handleSearchChange = (val) => {
    setSearchTerm(val);
    if (val.trim()) {
      searchParams.set('search', val.trim());
    } else {
      searchParams.delete('search');
    }
    setSearchParams(searchParams);
  };

  const handleResetFilters = () => {
    setActiveCategory('all');
    setSearchTerm('');
    setSortBy('featured');
    setPriceRange('all');
    setSearchParams({});
  };

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Category filter
    if (activeCategory !== 'all') {
      const targetCategoryObj = categories.find((c) => c.id === activeCategory);
      const targetName = targetCategoryObj ? targetCategoryObj.name.toLowerCase() : activeCategory.toLowerCase();
      result = result.filter(
        (p) =>
          p.category.toLowerCase() === targetName ||
          p.category.toLowerCase().replace(/[^a-z]/g, '') === activeCategory.replace(/[^a-z]/g, '')
      );
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const words = term.split(/\s+/).filter(Boolean);
      result = result.filter((p) => {
        const searchable = [
          p.name,
          p.title,
          p.seller,
          p.sellerName,
          p.description,
          p.category,
          p.materials,
          p.location
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (searchable.includes(term)) return true;

        return words.every((w) => {
          if (searchable.includes(w)) return true;
          if (w === 'wooden' && searchable.includes('wood')) return true;
          if (w === 'wood' && searchable.includes('wooden')) return true;
          if (
            w === 'vintage' &&
            (searchable.includes('vintage') || searchable.includes('archival') || searchable.includes('c. 19'))
          ) {
            return true;
          }
          return false;
        });
      });
    }

    // Price range filter
    if (priceRange === 'under-15k') {
      result = result.filter((p) => p.price < 15000);
    } else if (priceRange === '15k-30k') {
      result = result.filter((p) => p.price >= 15000 && p.price <= 30000);
    } else if (priceRange === 'above-30k') {
      result = result.filter((p) => p.price > 30000);
    }

    // Sorting
    if (sortBy === 'price-low') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name-asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'featured') {
      result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return result;
  }, [products, activeCategory, searchTerm, sortBy, priceRange, categories]);

  return (
    <div style={{ paddingTop: '32px', paddingBottom: '80px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">
        {/* Marketplace Header & Breadcrumb */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <span>Marketplace</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {activeCategory === 'all' ? 'All Objects' : categories.find(c => c.id === activeCategory)?.name || activeCategory}
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.85rem, 3vw, 2.5rem)', margin: 0 }}>
            {activeCategory === 'all' ? 'Browse All Marketplace Objects' : categories.find(c => c.id === activeCategory)?.name}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Discover tactile ceramics, archival furniture, and fine art pieces direct from verified ateliers.
          </p>
        </div>

        {/* Filter Controls Bar (Marketplace-grade) */}
        <div
          style={{
            border: '1px solid var(--border-color)',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-xs)',
            padding: '16px 20px',
            marginBottom: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)'
          }}
        >
          {/* Top Row: Search and Sort */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <SearchBar
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search by object name, maker, or medium..."
              maxWidth="420px"
            />

            {/* Price Range Pills & Sort Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              {/* Price Range Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Price:
                </span>
                <select
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  style={{
                    height: '36px',
                    padding: '0 10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'var(--bg-primary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">Any Price</option>
                  <option value="under-15k">Under ₹15,000</option>
                  <option value="15k-30k">₹15,000 — ₹30,000</option>
                  <option value="above-30k">Above ₹30,000</option>
                </select>
              </div>

              {/* Sort Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Sort:
                </span>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    height: '36px',
                    padding: '0 10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'var(--bg-primary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="featured">Curator's Choice</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Alphabetical (A—Z)</option>
                </select>
              </div>

              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                <strong>{filteredProducts.length}</strong> items
              </span>
            </div>
          </div>

          {/* Bottom Row: Category Filter Pills */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-color)',
              scrollbarWidth: 'none'
            }}
          >
            {categories.map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-xs)',
                    border: isSelected ? '1px solid var(--accent-burgundy)' : '1px solid var(--border-color)',
                    backgroundColor: isSelected ? 'var(--accent-burgundy)' : '#FFFFFF',
                    color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    fontWeight: isSelected ? 600 : 500,
                    transition: 'all 150ms ease'
                  }}
                >
                  {cat.name}
                </button>
              );
            })}

            {(activeCategory !== 'all' || searchTerm || priceRange !== 'all') && (
              <button
                onClick={handleResetFilters}
                className="btn-subtle"
                style={{ height: '30px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RotateCcw size={12} />
                <span>Reset all</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {(activeCategory !== 'all' || searchTerm || priceRange !== 'all') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '24px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Filters:
            </span>
            {activeCategory !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--accent-burgundy)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '11px',
                  color: 'var(--accent-burgundy)',
                  fontWeight: 600
                }}
              >
                <span>Category: {categories.find((c) => c.id === activeCategory)?.name || activeCategory}</span>
                <button
                  onClick={() => handleCategorySelect('all')}
                  style={{ color: 'var(--accent-burgundy)', display: 'flex', alignItems: 'center' }}
                  aria-label="Remove category filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {searchTerm && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  fontWeight: 500
                }}
              >
                <span>Search: "{searchTerm}"</span>
                <button
                  onClick={() => handleSearchChange('')}
                  style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                  aria-label="Clear search filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {priceRange !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  fontWeight: 500
                }}
              >
                <span>
                  Price: {priceRange === 'under-15k' ? 'Under ₹15,000' : priceRange === '15k-30k' ? '₹15,000 – ₹30,000' : 'Above ₹30,000'}
                </span>
                <button
                  onClick={() => setPriceRange('all')}
                  style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                  aria-label="Clear price filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              onClick={handleResetFilters}
              style={{
                fontSize: '11px',
                color: 'var(--accent-burgundy)',
                textDecoration: 'underline',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Product Grid */}
        {filteredProducts.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 'clamp(16px, 2.5vw, 24px)'
            }}
          >
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onQuickView={setQuickViewProduct}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div
            style={{
              textAlign: 'center',
              padding: '64px 20px',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-xs)',
              border: '1px dashed var(--border-color)',
              maxWidth: '540px',
              margin: '30px auto'
            }}
          >
            <h3 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>No marketplace objects found</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              No pieces match your active filters ({searchTerm || activeCategory}). Try clearing search terms or selecting a broader price bracket.
            </p>
            <button onClick={handleResetFilters} className="btn btn-burgundy btn-sm">
              <RotateCcw size={14} />
              <span>Reset all filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <ProductQuickViewModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </div>
  );
};
