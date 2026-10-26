import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Hammer,
  Sparkles,
  Clock,
  Flame,
  X,
  ExternalLink,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { formatINR } from '../data/products';

export const CAROUSEL_CATEGORIES = [
  {
    id: 'arts-crafts',
    name: 'Arts & Crafts',
    eyebrow: 'Edition Works & Archival Paper',
    description:
      'Singular monotypes, limited-edition reduction linocuts, and fine studio works on archival cotton rag paper.',
    image:
      'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1920&q=85',
    shopQuery: 'art-prints',
    auctionCategory: 'Art & Prints',
    matchKeywords: ['art & prints', 'art', 'prints', 'crafts', 'arts & crafts', 'woodcut', 'monotype']
  },
  {
    id: 'handmade-ceramics',
    name: 'Handmade Ceramics',
    eyebrow: 'High-Fire Stoneware & Vessels',
    description:
      'Wood-fired anagama vessels, smoke-fired raku jars with botanical slips, and master-crafted kyusu teapots.',
    image:
      'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=1920&q=85',
    shopQuery: 'handmade',
    auctionCategory: 'Handmade',
    matchKeywords: ['handmade', 'handmade ceramics', 'ceramics', 'raku', 'stoneware', 'pottery']
  },
  {
    id: 'home-living',
    name: 'Home & Living',
    eyebrow: 'Architectural Objects & Tableware',
    description:
      'Sand-cast solid architectural bronze candlesticks, lathe-turned walnut catchalls, and natural botanical textiles.',
    image:
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1920&q=85',
    shopQuery: 'home-living',
    auctionCategory: 'Home & Living',
    matchKeywords: ['home & living', 'home', 'living', 'bronze', 'table', 'console']
  },
  {
    id: 'jewellery-accessories',
    name: 'Jewellery & Accessories',
    eyebrow: 'Heirloom Silversmithing & Peace Silk',
    description:
      'Hand-forged sterling silver ornaments, natural gemstone amulets, and wild Indian muga silks woven on pit-looms.',
    image:
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1920&q=85',
    shopQuery: 'fashion',
    auctionCategory: 'Fashion & Accessories',
    matchKeywords: ['fashion & accessories', 'fashion', 'jewellery', 'jewelry', 'accessories', 'silver', 'amulet', 'ewer']
  },
  {
    id: 'vintage-collectibles',
    name: 'Vintage & Collectibles',
    eyebrow: 'Mid-Century Modern & Archival Relics',
    description:
      'Authenticated Pierre Jeanneret teak seating, Bauhaus task lighting, volcanic basalt, and museum-provenanced artifacts.',
    image:
      'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1920&q=85',
    shopQuery: 'vintage',
    auctionCategory: 'Vintage Finds',
    matchKeywords: ['vintage finds', 'vintage', 'collectibles', 'chair', 'credenza', 'basalt', 'astrolabe']
  }
];

// Helper to format remaining auction seconds
const formatSeconds = (totalSeconds) => {
  if (!totalSeconds || totalSeconds <= 0) return 'Concluded';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
};

/**
 * Category Auctions Modal
 * Displays all live and upcoming auctions belonging to the selected category.
 * Live auctions navigate to live auction room or open QuickBidModal.
 * Upcoming auctions navigate to Upcoming Lots.
 */
export const CategoryAuctionsModal = ({
  category,
  liveAuctions = [],
  upcomingAuctions = [],
  onClose,
  onOpenBidModal
}) => {
  const navigate = useNavigate();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!category) return null;

  // Filter auctions matching this category
  const matchesCategory = (auc) => {
    const catStr = (auc.category || '').toLowerCase();
    const nameStr = (auc.name || '').toLowerCase();
    const makerStr = (auc.maker || auc.seller || '').toLowerCase();
    return category.matchKeywords.some(
      (kw) => catStr.includes(kw) || nameStr.includes(kw) || makerStr.includes(kw)
    );
  };

  const matchingLive = liveAuctions.filter(matchesCategory);
  const matchingUpcoming = upcomingAuctions.filter(matchesCategory);
  const totalMatching = matchingLive.length + matchingUpcoming.length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(10, 10, 12, 0.78)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease-out'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            backgroundColor: '#FCFAF7'
          }}
        >
          <div>
            <span
              style={{
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--accent-burgundy)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px'
              }}
            >
              <Hammer size={13} />
              <span>Category Auction Showcase</span>
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(1.5rem, 3vw, 1.9rem)',
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: '4px'
              }}
            >
              {category.name} — Curated Auctions
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              {totalMatching > 0
                ? `${totalMatching} curated lots currently catalogue-listed in this discipline.`
                : `Currently appraising upcoming private collections in ${category.name}.`}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              backgroundColor: '#FFFFFF',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          {/* 1. Live Auctions Section */}
          {matchingLive.length > 0 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '14px'
                }}
              >
                <span className="badge-live" style={{ fontSize: '11px' }}>
                  <span className="dot" />
                  SYNCHRONIZED LIVE FLOOR ({matchingLive.length})
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {matchingLive.map((auc) => (
                  <div
                    key={auc.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      backgroundColor: '#FFFFFF',
                      transition: 'border-color 0.2s ease',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 260px' }}>
                      <img
                        src={auc.image || auc.images?.[0]}
                        alt={auc.name}
                        style={{
                          width: '68px',
                          height: '68px',
                          objectFit: 'cover',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: '#F5F3EF'
                        }}
                      />
                      <div>
                        <h4
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '15px',
                            fontWeight: 500,
                            marginBottom: '4px',
                            color: 'var(--text-primary)'
                          }}
                        >
                          {auc.name}
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          {auc.maker || auc.seller}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-burgundy)' }}>
                            {formatINR(auc.currentBid)}
                          </span>
                          <span style={{ color: 'var(--border-color)' }}>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                            <Clock size={12} />
                            <span>{formatSeconds(auc.remainingSeconds ?? auc.endsInSeconds)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => {
                          onClose();
                          if (onOpenBidModal) onOpenBidModal(auc);
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '12px', height: '34px', padding: '0 12px' }}
                      >
                        Quick Bid
                      </button>
                      <button
                        onClick={() => {
                          onClose();
                          navigate(`/live/${auc.id}`);
                        }}
                        className="btn btn-burgundy btn-sm"
                        style={{ fontSize: '12px', height: '34px', padding: '0 14px' }}
                      >
                        <span>Enter Live Room</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Upcoming Auctions Section */}
          {matchingUpcoming.length > 0 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '14px'
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Calendar size={13} />
                  <span>UPCOMING LOTS ({matchingUpcoming.length})</span>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {matchingUpcoming.map((auc) => (
                  <div
                    key={auc.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      backgroundColor: '#FAFAFA',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 260px' }}>
                      <img
                        src={auc.thumbnail || auc.image}
                        alt={auc.name}
                        style={{
                          width: '68px',
                          height: '68px',
                          objectFit: 'cover',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: '#F5F3EF'
                        }}
                      />
                      <div>
                        <h4
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '15px',
                            fontWeight: 500,
                            marginBottom: '4px',
                            color: 'var(--text-primary)'
                          }}
                        >
                          {auc.name}
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          {auc.maker || auc.seller}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            Starting: {formatINR(auc.startingBid)}
                          </span>
                          <span style={{ color: 'var(--border-color)' }}>•</span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {auc.scheduledDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onClose();
                        navigate(`/upcoming-lots?category=${encodeURIComponent(category.auctionCategory || category.name)}`);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '12px', height: '34px', padding: '0 14px' }}
                    >
                      <span>View in Upcoming Lots</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty fallback */}
          {totalMatching === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                backgroundColor: '#FAF9F6',
                borderRadius: 'var(--radius-xs)',
                border: '1px dashed var(--border-color)'
              }}
            >
              <Hammer size={28} color="var(--text-secondary)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', marginBottom: '6px' }}>
                Catalogues in Curation
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 18px' }}>
                Our specialists are presently authenticating lots for our next {category.name} session. Explore our marketplace shop or discover our full live schedule.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    onClose();
                    navigate('/live-auctions');
                  }}
                  className="btn btn-burgundy btn-sm"
                >
                  Explore All Live Auctions
                </button>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/shop?category=${category.shopQuery}`);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Shop {category.name} Objects
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link
              to={`/live-auctions?category=${encodeURIComponent(category.auctionCategory || category.name)}`}
              onClick={onClose}
              style={{ fontSize: '12.5px', color: 'var(--accent-burgundy)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>View All Live Floor</span>
              <ArrowRight size={12} />
            </Link>
            <Link
              to={`/upcoming-lots?category=${encodeURIComponent(category.auctionCategory || category.name)}`}
              onClick={onClose}
              style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>View Upcoming Sessions</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '12px', height: '32px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * CategoryCarousel Component
 * Christie's-inspired editorial hero category carousel.
 * Positioned immediately beneath the navigation bar.
 * Only ONE category visible at a time.
 * Supports smooth transitions, left/right navigation, and seamless looping.
 */
export const CategoryCarousel = ({
  liveAuctions = [],
  upcomingAuctions = [],
  onOpenBidModal
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeCategoryModal, setActiveCategoryModal] = useState(null);
  const totalSlides = CAROUSEL_CATEGORIES.length;

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  const goToIndex = useCallback((idx) => {
    setCurrentIndex(idx);
  }, []);

  // Keyboard navigation (Left / Right arrows)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if an input is focused or modal is open
      if (activeCategoryModal) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, activeCategoryModal]);

  const currentCategory = CAROUSEL_CATEGORIES[currentIndex];

  return (
    <section
      aria-label="Editorial Category Showcase"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 'clamp(580px, 80vh, 760px)',
        backgroundColor: '#0A0A0C',
        overflow: 'hidden',
        color: '#FFFFFF'
      }}
    >
      {/* Background Slides */}
      {CAROUSEL_CATEGORIES.map((cat, idx) => {
        const isCurrent = idx === currentIndex;
        return (
          <div
            key={cat.id}
            aria-hidden={!isCurrent}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: isCurrent ? 1 : 0,
              pointerEvents: isCurrent ? 'auto' : 'none',
              transition: 'opacity 700ms cubic-bezier(0.25, 1, 0.5, 1)',
              zIndex: 1
            }}
          >
            {/* Background Image */}
            <img
              src={cat.image}
              alt={cat.name}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: isCurrent ? 'scale(1)' : 'scale(1.05)',
                transition: 'transform 1200ms cubic-bezier(0.25, 1, 0.5, 1)',
                filter: 'brightness(0.92)'
              }}
            />

            {/* High-contrast dark gradient overlay on the left side */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, rgba(8, 8, 10, 0.94) 0%, rgba(8, 8, 10, 0.84) 38%, rgba(8, 8, 10, 0.45) 68%, rgba(8, 8, 10, 0.15) 100%)',
                zIndex: 2
              }}
            />

            {/* Subtle bottom gradient to highlight indicators */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, transparent 65%, rgba(8, 8, 10, 0.8) 100%)',
                zIndex: 2
              }}
            />
          </div>
        );
      })}

      {/* Slide Content Container */}
      <div
        className="container"
        style={{
          position: 'relative',
          zIndex: 3,
          minHeight: 'clamp(580px, 80vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingTop: '64px',
          paddingBottom: '88px'
        }}
      >
        <div style={{ maxWidth: '640px' }}>
          {/* Refined Eyebrow */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#D4AF37', // Muted antique gold
              fontSize: '11.5px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: '16px'
            }}
          >
            <Sparkles size={13} />
            <span>Curated Discipline — {currentCategory.eyebrow}</span>
          </div>

          {/* Prominent Category Title (Refined Serif Font) */}
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(2.7rem, 5.5vw, 4.4rem)',
              fontWeight: 400,
              color: '#FFFFFF',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              marginBottom: '18px',
              textShadow: '0 2px 20px rgba(0, 0, 0, 0.5)'
            }}
          >
            {currentCategory.name}
          </h1>

          {/* Short, Compelling Description */}
          <p
            style={{
              fontSize: 'clamp(14px, 1.25vw, 16.5px)',
              color: 'rgba(240, 240, 240, 0.92)',
              lineHeight: 1.65,
              maxWidth: '520px',
              marginBottom: '34px',
              textShadow: '0 1px 8px rgba(0, 0, 0, 0.35)'
            }}
          >
            {currentCategory.description}
          </p>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              flexWrap: 'wrap'
            }}
          >
            {/* Button 1: "Explore Auctions" */}
            <button
              onClick={() => setActiveCategoryModal(currentCategory)}
              className="btn btn-burgundy"
              style={{
                height: '46px',
                padding: '0 24px',
                fontSize: '13.5px',
                letterSpacing: '0.04em',
                fontWeight: 600,
                boxShadow: '0 4px 18px rgba(114, 47, 55, 0.45)',
                cursor: 'pointer'
              }}
            >
              <Hammer size={16} />
              <span>Explore Auctions</span>
            </button>

            {/* Button 2: "Explore [Category Name] & Bids" */}
            <Link
              to={`/shop?category=${currentCategory.shopQuery}`}
              style={{
                height: '46px',
                padding: '0 24px',
                fontSize: '13.5px',
                letterSpacing: '0.04em',
                fontWeight: 500,
                color: '#FFFFFF',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: 'var(--radius-xs)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              className="carousel-secondary-btn"
            >
              <span>Explore {currentCategory.name} & Bids</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>

      {/* Clean Left and Right Navigation Arrows */}
      <button
        onClick={goToPrev}
        aria-label="Previous Category"
        style={{
          position: 'absolute',
          left: 'clamp(14px, 3vw, 36px)',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          backgroundColor: 'rgba(15, 15, 18, 0.55)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          transition: 'all 0.2s ease'
        }}
        className="carousel-nav-arrow"
      >
        <ChevronLeft size={22} />
      </button>

      <button
        onClick={goToNext}
        aria-label="Next Category"
        style={{
          position: 'absolute',
          right: 'clamp(14px, 3vw, 36px)',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          backgroundColor: 'rgba(15, 15, 18, 0.55)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          transition: 'all 0.2s ease'
        }}
        className="carousel-nav-arrow"
      >
        <ChevronRight size={22} />
      </button>

      {/* Subtle Bottom Indicators */}
      <div
        style={{
          position: 'absolute',
          bottom: 'clamp(20px, 3.5vw, 36px)',
          left: 0,
          right: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 clamp(20px, 5vw, 64px)'
        }}
      >
        {/* Active Category Number & Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            color: '#FFFFFF',
            fontFamily: 'var(--font-serif)',
            fontSize: '15px'
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '18px', color: '#FFFFFF' }}>
            {String(currentIndex + 1).padStart(2, '0')}
          </span>
          <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>/</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '13px' }}>
            {String(totalSlides).padStart(2, '0')}
          </span>
          <span
            style={{
              marginLeft: '12px',
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.75)',
              fontFamily: 'var(--font-sans, system-ui)'
            }}
          >
            {currentCategory.name}
          </span>
        </div>

        {/* Indicator Bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {CAROUSEL_CATEGORIES.map((cat, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={cat.id}
                onClick={() => goToIndex(idx)}
                aria-label={`Go to category slide ${idx + 1}: ${cat.name}`}
                style={{
                  width: isActive ? '38px' : '18px',
                  height: '3px',
                  borderRadius: '2px',
                  backgroundColor: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.35)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
                }}
                className="carousel-dot"
              />
            );
          })}
        </div>
      </div>

      {/* Scoped Carousel Hover Styles */}
      <style>{`
        .carousel-nav-arrow:hover {
          background-color: rgba(114, 47, 55, 0.85) !important;
          border-color: rgba(255, 255, 255, 0.7) !important;
          transform: translateY(-50%) scale(1.06) !important;
        }
        .carousel-secondary-btn:hover {
          background-color: rgba(255, 255, 255, 0.22) !important;
          border-color: rgba(255, 255, 255, 0.8) !important;
          transform: translateY(-1px);
        }
        .carousel-dot:hover {
          background-color: rgba(255, 255, 255, 0.75) !important;
        }
      `}</style>

      {/* Category Auctions Modal */}
      {activeCategoryModal && (
        <CategoryAuctionsModal
          category={activeCategoryModal}
          liveAuctions={liveAuctions}
          upcomingAuctions={upcomingAuctions}
          onClose={() => setActiveCategoryModal(null)}
          onOpenBidModal={onOpenBidModal}
        />
      )}
    </section>
  );
};
