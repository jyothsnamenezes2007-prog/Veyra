import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Tag, ArrowRight, Sparkles } from 'lucide-react';
import { useProducts } from '../context/ProductsContext';
import { formatINR } from '../data/products';
import { getSearchSuggestions } from '../lib/searchSuggestions';

export { getSearchSuggestions };

export const SearchSuggestionsDropdown = ({
  query = '',
  isOpen = false,
  onClose,
  onSelectSuggestion
}) => {
  const navigate = useNavigate();
  const { products, categories } = useProducts();

  const trimmed = query.trim();

  const { products: suggestedProducts, categories: suggestedCategories, totalProductMatches, hasMatches } =
    useMemo(() => {
      if (!trimmed) return { products: [], categories: [], totalProductMatches: 0, hasMatches: false };
      return getSearchSuggestions(trimmed, products, categories);
    }, [trimmed, products, categories]);

  if (!isOpen || !trimmed) return null;

  const handleProductClick = (product) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(product.name);
    }
    if (onClose) onClose();
    navigate(`/product/${product.id}`);
  };

  const handleCategoryClick = (cat) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(cat.name);
    }
    if (onClose) onClose();
    navigate(`/shop?category=${encodeURIComponent(cat.id)}`);
  };

  const handleViewAllClick = () => {
    if (onClose) onClose();
    navigate(`/shop?search=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div
      className="search-suggestions-dropdown"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: '6px',
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-xs)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
        zIndex: 1050,
        overflow: 'hidden',
        textAlign: 'left'
      }}
      onMouseDown={(e) => {
        // Prevent search input from blurring before click completes
        e.preventDefault();
      }}
    >
      {!hasMatches ? (
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            No marketplace objects found matching <strong>"{trimmed}"</strong>
          </p>
          <button
            type="button"
            onClick={handleViewAllClick}
            style={{
              marginTop: '10px',
              border: 'none',
              background: 'transparent',
              color: 'var(--accent-burgundy)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>Browse all marketplace objects</span>
            <ArrowRight size={13} />
          </button>
        </div>
      ) : (
        <div>
          {/* Category Suggestions */}
          {suggestedCategories.length > 0 && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>
                Categories
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {suggestedCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryClick(cat)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid var(--border-color)',
                      fontSize: '11.5px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    <Tag size={11} color="var(--accent-burgundy)" />
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Suggestions */}
          {suggestedProducts.length > 0 && (
            <div style={{ padding: '6px 0' }}>
              <div style={{ padding: '6px 14px 4px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Suggested Products
              </div>
              {suggestedProducts.map((product) => {
                const img = product.image || (product.images && product.images[0]) || '';
                return (
                  <div
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 14px',
                      cursor: 'pointer',
                      transition: 'background-color 120ms ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {img ? (
                      <img
                        src={img}
                        alt={product.name}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius-xs)',
                          objectFit: 'cover',
                          backgroundColor: 'var(--surface-secondary)',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--surface-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Search size={16} color="var(--text-secondary)" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {product.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span>{product.category || 'Atelier Object'}</span>
                        {product.seller && <span>• {product.seller}</span>}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: 'var(--accent-burgundy)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {formatINR(product.price)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer: View all matches */}
          <div
            onClick={handleViewAllClick}
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--accent-burgundy)',
              fontWeight: 600
            }}
          >
            <span>
              View all {totalProductMatches} results for "{trimmed}"
            </span>
            <ArrowRight size={13} />
          </div>
        </div>
      )}
    </div>
  );
};
