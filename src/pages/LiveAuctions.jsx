import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Clock,
  Hammer,
  RotateCcw,
  ShieldCheck,
  Flame,
  Heart,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useAuctions } from '../context/AuctionContext';
import { useWishlist } from '../context/WishlistContext';
import { formatINR } from '../data/products';
import { AdminAuctionControls } from '../components/AdminAuctionControls';

export const LiveAuctions = () => {
  const { liveAuctions } = useAuctions();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [searchParams] = useSearchParams();

  // Independent Live Auctions Filter State
  // Initialize category from URL ?category= param (e.g. from Categories page "Explore Auctions" button)
  const initialCategory = searchParams.get('category') || 'all';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [bidRange, setBidRange] = useState('all'); // 'all', 'under-60k', '60k-100k', 'above-100k'
  const [activityFilter, setActivityFilter] = useState('all'); // 'all', 'high-activity'
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [sortBy, setSortBy] = useState('ending-soon'); // 'ending-soon', 'current-bid-high', 'bid-count'
  const [endingSoonOnly, setEndingSoonOnly] = useState(false);

  // Extract unique sellers from active auctions
  const activeSellers = useMemo(() => {
    const set = new Set();
    liveAuctions.forEach((a) => {
      if (a.seller) set.add(a.seller);
    });
    return Array.from(set);
  }, [liveAuctions]);

  // Authoritative filter: ONLY auctions that are currently active (status active and remainingSeconds > 0)
  const activeLots = useMemo(() => {
    let result = liveAuctions.filter(
      (auc) => (auc.status === 'active' || (!auc.status && (auc.endsInSeconds || 0) > 0)) && (auc.remainingSeconds ?? 0) > 0
    );

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter(
        (a) => a.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Bid range filter
    if (bidRange === 'under-60k') {
      result = result.filter((a) => a.currentBid < 60000);
    } else if (bidRange === '60k-100k') {
      result = result.filter((a) => a.currentBid >= 60000 && a.currentBid <= 100000);
    } else if (bidRange === 'above-100k') {
      result = result.filter((a) => a.currentBid > 100000);
    }

    // Activity / Bid count filter
    if (activityFilter === 'high-activity') {
      result = result.filter((a) => a.bidCount >= 15);
    }

    // Ending soon filter (less than 2 hours)
    if (endingSoonOnly) {
      result = result.filter((a) => a.remainingSeconds <= 7200);
    }

    // Seller filter
    if (selectedSeller !== 'all') {
      result = result.filter((a) => a.seller === selectedSeller);
    }

    // Sorting
    if (sortBy === 'ending-soon') {
      result.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
    } else if (sortBy === 'current-bid-high') {
      result.sort((a, b) => b.currentBid - a.currentBid);
    } else if (sortBy === 'bid-count') {
      result.sort((a, b) => b.bidCount - a.bidCount);
    }

    return result;
  }, [liveAuctions, selectedCategory, bidRange, activityFilter, selectedSeller, sortBy, endingSoonOnly]);

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setBidRange('all');
    setActivityFilter('all');
    setSelectedSeller('all');
    setSortBy('ending-soon');
    setEndingSoonOnly(false);
  };

  const formatCountdown = (totalSeconds) => {
    if (totalSeconds <= 0) return 'Concluded';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  };

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ maxWidth: '680px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="badge-live">
              <span className="dot" />
              SYNCHRONIZED BIDDING ROOM
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', marginBottom: '10px' }}>
            Currently Active Auctions
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Bidding in real time for single-edition masterworks, authenticated archival furniture, and living art. Only lots with active server clocks are displayed.
          </p>
        </div>

        {/* Global Demo Presentation Admin Bar */}
        <AdminAuctionControls isGlobal={true} />

        {/* Independent Live Auctions Filter Bar */}
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
          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
            {/* Category */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                fontSize: '12.5px',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Categories</option>
              <option value="Vintage Finds">Vintage Finds</option>
              <option value="Collectibles">Collectibles</option>
              <option value="Handmade">Handmade</option>
              <option value="Home & Living">Home & Living</option>
              <option value="Art & Prints">Art & Prints</option>
            </select>

            {/* Current Bid Range */}
            <select
              value={bidRange}
              onChange={(e) => setBidRange(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                fontSize: '12.5px',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Current Bids</option>
              <option value="under-60k">Under ₹60,000</option>
              <option value="60k-100k">₹60,000 – ₹100,000</option>
              <option value="above-100k">Above ₹100,000</option>
            </select>

            {/* Seller */}
            {activeSellers.length > 0 && (
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                style={{
                  height: '38px',
                  padding: '0 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '12.5px',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Workshops</option>
                {activeSellers.map((seller) => (
                  <option key={seller} value={seller}>{seller}</option>
                ))}
              </select>
            )}

            {/* Activity */}
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              style={{
                height: '38px',
                padding: '0 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                fontSize: '12.5px',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Bidding Activity</option>
              <option value="high-activity">High Activity (15+ Bids)</option>
            </select>

            {/* Ending Soon Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={endingSoonOnly}
                onChange={(e) => setEndingSoonOnly(e.target.checked)}
                style={{ accentColor: 'var(--accent-burgundy)' }}
              />
              <span>Closing Within 2 Hours</span>
            </label>
          </div>

          {/* Sort & Reset */}
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
                <option value="ending-soon">Closing Soonest</option>
                <option value="current-bid-high">Current Highest Bid</option>
                <option value="bid-count">Most Active (Bids)</option>
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
              title="Reset filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Results Counter */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Showing <strong>{activeLots.length}</strong> active lots in progress
          </span>
        </div>

        {/* Live Auction Lots Grid */}
        {activeLots.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
              gap: '28px'
            }}
          >
            {activeLots.map((auction) => {
              const isFav = isInWishlist(auction.productId || auction.id);
              const minNext = auction.currentBid + auction.minIncrement;

              return (
                <article
                  key={auction.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                  className="card-interactive"
                >
                  {/* Image Frame */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16 / 11',
                      backgroundColor: 'var(--surface-secondary)',
                      overflow: 'hidden'
                    }}
                  >
                    <Link to={`/live/${auction.id}`} style={{ display: 'block', width: '100%', height: '100%' }}>
                      <img
                        src={auction.image}
                        alt={auction.name}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </Link>

                    {/* Live Badge */}
                    <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                      <span className="badge-live">
                        <span className="dot" />
                        LIVE LOT
                      </span>
                    </div>

                    {/* Lot ID */}
                    <span
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '48px',
                        padding: '2px 6px',
                        backgroundColor: 'rgba(25, 25, 25, 0.8)',
                        color: '#FFF',
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        borderRadius: 'var(--radius-xs)'
                      }}
                    >
                      LOT #{auction.id.toUpperCase()}
                    </span>

                    {/* Watchlist */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleWishlist({
                          id: auction.productId || auction.id,
                          name: auction.name,
                          image: auction.image,
                          price: auction.currentBid,
                          category: auction.category
                        });
                      }}
                      aria-label="Save lot to watchlist"
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isFav ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      <Heart size={14} fill={isFav ? 'currentColor' : 'none'} strokeWidth={1.75} />
                    </button>
                  </div>

                  {/* Body Content */}
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                    <div>
                      <span className="badge-tag" style={{ marginBottom: '6px' }}>
                        {auction.category}
                      </span>

                      <Link to={`/live/${auction.id}`}>
                        <h3
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '1.25rem',
                            fontWeight: 500,
                            lineHeight: 1.25,
                            marginBottom: '4px',
                            color: 'var(--text-primary)'
                          }}
                          className="hover-burgundy"
                        >
                          {auction.name}
                        </h3>
                      </Link>

                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        Atelier: <strong style={{ color: 'var(--text-primary)' }}>{auction.seller || auction.maker}</strong>
                      </p>
                    </div>

                    <div>
                      {/* Price & Timer Grid */}
                      <div
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-color)',
                          marginBottom: '14px',
                          display: 'grid',
                          gridTemplateColumns: '1.2fr 1fr',
                          gap: '8px'
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', display: 'block' }}>
                            Current Bid ({auction.bidCount} bids)
                          </span>
                          <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatINR(auction.currentBid)}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--accent-burgundy)', display: 'block' }}>
                            Next Min: {formatINR(minNext)}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', display: 'block' }}>
                            Time Left
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12.5px',
                              fontWeight: 700,
                              color: 'var(--accent-burgundy)',
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          >
                            <Clock size={13} />
                            <span>{formatCountdown(auction.remainingSeconds)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Join Live Action Button */}
                      <Link
                        to={`/live/${auction.id}`}
                        className="btn btn-burgundy"
                        style={{ width: '100%', height: '40px', fontSize: '12.5px', fontWeight: 600, letterSpacing: '0.04em' }}
                      >
                        <Hammer size={14} />
                        <span>Join Live & Bid</span>
                      </Link>
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
              No active auctions currently match your selected filters.
            </p>
            <button onClick={handleResetFilters} className="btn btn-primary btn-sm">
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
