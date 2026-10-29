import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  RotateCcw,
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  ShoppingBag,
  Sparkles,
  Search,
  CheckCircle2,
  Heart,
  Gavel
} from 'lucide-react';
import { useProducts } from '../context/ProductsContext';
import { useAuctions } from '../context/AuctionContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { formatINR } from '../data/products';
import { getAuthoritativeAuctionStatus } from '../data/auctions';

export const Shop = () => {
  const { products, categories } = useProducts();
  const { liveAuctions, upcomingAuctions, customAuctions } = useAuctions();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const [searchParams, setSearchParams] = useSearchParams();

  const initialCategory = searchParams.get('category') || 'all';
  const initialSearch = searchParams.get('search') || '';

  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [sortBy, setSortBy] = useState('featured');
  const [priceRange, setPriceRange] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Sync state with URL params
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) setActiveCategory(cat);
    const q = searchParams.get('search');
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);

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
    setConditionFilter('all');
    setInStockOnly(false);
    setSearchParams({});
  };

  // Combine shop products and approved auctions for unified search catalog
  const allCatalogItems = useMemo(() => {
    // 1. Eligible shop products (no deleted items)
    const validShopProducts = (products || [])
      .filter((p) => !p.isAuction && p.type !== 'auction' && p.status !== 'deleted' && (!p.listingStatus || p.listingStatus === 'active'))
      .map((p) => ({
        ...p,
        isAuction: false,
        listingType: 'shop',
        badgeLabel: 'Shop',
        displayPrice: p.price
      }));

    // 2. Eligible auctions (deduplicated by ID, no deleted or cancelled items)
    const auctionMap = new Map();
    [...(liveAuctions || []), ...(upcomingAuctions || []), ...(customAuctions || [])].forEach((auc) => {
      if (!auc || !auc.id) return;
      if (auc.status === 'deleted' || auc.status === 'cancelled' || auc.approvalStatus === 'rejected' || auc.approvalStatus === 'pending') return;
      if (!auctionMap.has(auc.id)) {
        const auth = getAuthoritativeAuctionStatus(auc);
        auctionMap.set(auc.id, {
          ...auc,
          isAuction: true,
          listingType: 'auction',
          price: auc.currentBid || auc.startingBid || 0,
          displayPrice: auc.currentBid || auc.startingBid || 0,
          seller: auc.seller || auc.maker || 'Veyra Workshop',
          description: auc.description || 'Rare distinctive collectible lot.',
          badgeLabel: auth.isLive ? 'Live Auction' : auth.isUpcoming ? 'Upcoming Lot' : 'Concluded',
          authStatus: auth
        });
      }
    });

    return [...validShopProducts, ...Array.from(auctionMap.values())];
  }, [products, liveAuctions, upcomingAuctions, customAuctions]);

  // Filtered & sorted products list (supports both shop and auctions when searching)
  const filteredProducts = useMemo(() => {
    // If search term is present, search both shop items and auctions
    // If no search term is present, browse shop products
    let pool = searchTerm.trim()
      ? allCatalogItems
      : allCatalogItems.filter((item) => !item.isAuction);

    // Category filter
    if (activeCategory !== 'all') {
      const targetCatObj = categories.find((c) => c.id === activeCategory);
      const targetName = targetCatObj ? targetCatObj.name.toLowerCase() : activeCategory.toLowerCase();
      pool = pool.filter(
        (p) =>
          (p.category || '').toLowerCase().includes(targetName) ||
          (p.category || '').toLowerCase().replace(/[^a-z]/g, '') === activeCategory.replace(/[^a-z]/g, '')
      );
    }

    // Search filter with exact-match prioritization
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const scored = [];

      pool.forEach((p) => {
        const name = (p.name || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        const seller = (p.seller || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();

        let score = 0;
        if (name === term) score += 1000;
        else if (name.startsWith(term)) score += 500;
        else if (name.split(/\s+/).some((w) => w.startsWith(term))) score += 300;
        else if (name.includes(term)) score += 200;

        if (cat === term) score += 150;
        else if (cat.startsWith(term)) score += 120;
        else if (cat.includes(term)) score += 80;

        if (seller.includes(term)) score += 50;
        if (desc.includes(term)) score += 10;

        if (score > 0) {
          scored.push({ item: p, score });
        }
      });

      scored.sort((a, b) => b.score - a.score);
      pool = scored.map((s) => s.item);
    }

    // Price range filter
    if (priceRange === 'under-15k') {
      pool = pool.filter((p) => p.displayPrice < 15000);
    } else if (priceRange === '15k-30k') {
      pool = pool.filter((p) => p.displayPrice >= 15000 && p.displayPrice <= 30000);
    } else if (priceRange === 'above-30k') {
      pool = pool.filter((p) => p.displayPrice > 30000);
    }

    // Condition filter
    if (conditionFilter !== 'all') {
      pool = pool.filter((p) =>
        (p.condition || '').toLowerCase().includes(conditionFilter.toLowerCase())
      );
    }

    // In-stock filter
    if (inStockOnly) {
      pool = pool.filter((p) => !p.isAuction && p.inStock);
    }

    // Sorting
    if (sortBy === 'price-low') {
      pool = [...pool].sort((a, b) => a.displayPrice - b.displayPrice);
    } else if (sortBy === 'price-high') {
      pool = [...pool].sort((a, b) => b.displayPrice - a.displayPrice);
    } else if (sortBy === 'rating') {
      pool = [...pool].sort((a, b) => (b.rating || 4.5) - (a.rating || 4.5));
    }

    return pool;
  }, [allCatalogItems, categories, activeCategory, searchTerm, priceRange, conditionFilter, inStockOnly, sortBy]);

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ maxWidth: '720px', marginBottom: '36px' }}>
          <span className="eyebrow">The Curated Collection</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', marginBottom: '10px' }}>
            Direct Studio Acquisitions
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Browse studio ceramics, cast bronzes, archival monotypes, and living objects directly from independent workshops worldwide.
          </p>
        </div>

        {/* Categories Pill Navigation Strip */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '16px',
            marginBottom: '28px',
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
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 400,
                  border: isSelected ? '1px solid var(--btn-primary)' : '1px solid var(--border-color)',
                  backgroundColor: isSelected ? 'var(--btn-primary)' : '#FFFFFF',
                  color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 150ms ease'
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xs)',
            padding: '16px 20px',
            marginBottom: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          {/* Left Controls: Search & Price */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={15} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="text"
                placeholder="Search studio pieces..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{
                  height: '38px',
                  paddingLeft: '34px',
                  paddingRight: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '13px',
                  outline: 'none',
                  backgroundColor: 'var(--bg-primary)',
                  width: '100%'
                }}
              />
            </div>

            {/* Price Filter */}
            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                fontSize: '12.5px',
                backgroundColor: '#FFFFFF',
                color: 'var(--text-primary)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Valuations</option>
              <option value="under-15k">Under ₹15,000</option>
              <option value="15k-30k">₹15,000 – ₹30,000</option>
              <option value="above-30k">Above ₹30,000</option>
            </select>

            {/* Condition Filter */}
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                fontSize: '12.5px',
                backgroundColor: '#FFFFFF',
                color: 'var(--text-primary)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Conditions</option>
              <option value="pristine">Pristine Studio</option>
              <option value="mint">Studio Mint</option>
              <option value="archival">Archival Vintage</option>
            </select>

            {/* In Stock Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                style={{ accentColor: 'var(--accent-burgundy)' }}
              />
              <span>In Stock Only</span>
            </label>
          </div>

          {/* Right Controls: Sort & Reset */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  height: '38px',
                  padding: '0 10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '12.5px',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="featured">Curated Selection</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Collector Rating</option>
              </select>
            </div>

            <button
              onClick={handleResetFilters}
              style={{
                height: '38px',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: '#FFFFFF',
                cursor: 'pointer'
              }}
              title="Reset all filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Results Count Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredProducts.length}</strong> {searchTerm.trim() ? 'distinctive objects & lots' : 'distinctive objects'}
          </span>
        </div>

        {/* Responsive Product Grid */}
        {filteredProducts.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '28px'
            }}
          >
            {filteredProducts.map((product) => {
              const isFav = isInWishlist(product.id);
              const targetUrl = product.isAuction ? `/live/${product.id}` : `/product/${product.id}`;

              return (
                <article
                  key={product.isAuction ? `auc-${product.id}` : `prod-${product.id}`}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  className="card-interactive"
                >
                  {/* Image Frame */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      backgroundColor: 'var(--surface-secondary)',
                      overflow: 'hidden'
                    }}
                  >
                    <Link to={targetUrl} style={{ display: 'block', width: '100%', height: '100%' }}>
                      <img
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </Link>

                    {/* Category & Auction Tag */}
                    <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          backgroundColor: 'rgba(248, 247, 244, 0.94)',
                          backdropFilter: 'blur(4px)',
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--text-secondary)',
                          borderRadius: 'var(--radius-xs)'
                        }}
                      >
                        {product.category}
                      </span>
                      {product.isAuction && (
                        <span
                          style={{
                            padding: '3px 8px',
                            backgroundColor: product.authStatus?.isLive ? 'rgba(120, 59, 75, 0.95)' : 'rgba(212, 163, 115, 0.95)',
                            color: '#FFF',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            borderRadius: 'var(--radius-xs)'
                          }}
                        >
                          {product.badgeLabel}
                        </span>
                      )}
                    </div>

                    {/* Heart Button */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleWishlist(product);
                      }}
                      aria-label="Toggle wishlist"
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isFav ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)'
                      }}
                    >
                      <Heart size={15} fill={isFav ? 'currentColor' : 'none'} strokeWidth={1.75} />
                    </button>
                  </div>

                  {/* Body Content */}
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                        {product.seller}
                      </span>

                      <Link to={targetUrl}>
                        <h3
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '1.25rem',
                            fontWeight: 500,
                            lineHeight: 1.25,
                            marginBottom: '6px',
                            color: 'var(--text-primary)'
                          }}
                          className="hover-burgundy"
                        >
                          {product.name}
                        </h3>
                      </Link>

                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.45,
                          marginBottom: '14px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {product.description}
                      </p>
                    </div>

                    {/* Price & Action */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <div>
                        {product.isAuction && (
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>
                            {product.authStatus?.isLive ? 'Current Bid' : 'Starting Bid'}
                          </span>
                        )}
                        <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {formatINR(product.displayPrice || product.price)}
                        </span>
                      </div>

                      {product.isAuction ? (
                        <Link
                          to={`/live/${product.id}`}
                          className="btn btn-burgundy btn-sm"
                          style={{ gap: '6px' }}
                        >
                          <Gavel size={13} />
                          <span>{product.authStatus?.isLive ? 'Floor Room' : 'View Lot'}</span>
                        </Link>
                      ) : (
                        <button
                          onClick={() => addToCart(product, 1)}
                          className="btn btn-secondary btn-sm"
                          style={{ gap: '6px' }}
                        >
                          <ShoppingBag size={13} />
                          <span>Add to Bag</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 20px',
              backgroundColor: '#FFFFFF',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-xs)'
            }}
          >
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              No objects match your current filter parameters.
            </p>
            <button onClick={handleResetFilters} className="btn btn-primary btn-sm">
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
