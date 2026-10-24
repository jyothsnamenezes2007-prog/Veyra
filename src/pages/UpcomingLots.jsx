import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  RotateCcw,
  Check,
  Bell,
  Eye,
  Store,
  ExternalLink,
  ShieldCheck,
  Heart
} from 'lucide-react';
import { useAuctions } from '../context/AuctionContext';
import { useWishlist } from '../context/WishlistContext';
import { formatINR } from '../data/products';

export const UpcomingLots = () => {
  const { upcomingAuctions, isReminderSet, toggleReminder, isRegistered, toggleRegistration } = useAuctions();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [searchParams] = useSearchParams();

  // Independent Upcoming Lots Filters
  // Initialize category from URL ?category= param (e.g. from Categories page "Explore Auctions" button)
  const initialCategory = searchParams.get('category') || 'all';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [startingBidRange, setStartingBidRange] = useState('all'); // 'all', 'under-80k', '80k-120k', 'above-120k'
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [sortBy, setSortBy] = useState('soonest'); // 'soonest', 'starting-bid-high', 'starting-bid-low'

  // Extract unique sellers
  const upcomingSellers = useMemo(() => {
    const set = new Set();
    upcomingAuctions.forEach((a) => {
      if (a.seller || a.maker) set.add(a.seller || a.maker);
    });
    return Array.from(set);
  }, [upcomingAuctions]);

  // Filtered upcoming lots
  const filteredUpcoming = useMemo(() => {
    let result = [...upcomingAuctions];

    // Category
    if (selectedCategory !== 'all') {
      result = result.filter(
        (a) => a.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Starting bid range
    if (startingBidRange === 'under-80k') {
      result = result.filter((a) => a.startingBid < 80000);
    } else if (startingBidRange === '80k-120k') {
      result = result.filter((a) => a.startingBid >= 80000 && a.startingBid <= 120000);
    } else if (startingBidRange === 'above-120k') {
      result = result.filter((a) => a.startingBid > 120000);
    }

    // Seller
    if (selectedSeller !== 'all') {
      result = result.filter((a) => (a.seller || a.maker) === selectedSeller);
    }

    // Sorting
    if (sortBy === 'soonest') {
      result.sort((a, b) => (a.scheduledTimestamp || 0) - (b.scheduledTimestamp || 0));
    } else if (sortBy === 'starting-bid-high') {
      result.sort((a, b) => b.startingBid - a.startingBid);
    } else if (sortBy === 'starting-bid-low') {
      result.sort((a, b) => a.startingBid - b.startingBid);
    }

    return result;
  }, [upcomingAuctions, selectedCategory, startingBidRange, selectedSeller, sortBy]);

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setStartingBidRange('all');
    setSelectedSeller('all');
    setSortBy('soonest');
  };

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ maxWidth: '680px', marginBottom: '32px' }}>
          <span className="eyebrow">Forthcoming Catalog Openings</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', marginBottom: '10px' }}>
            Upcoming Auction Lots
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Preview scheduled catalog sessions. Register in advance to obtain your bidding paddle and set honest in-app calendar reminders.
          </p>
        </div>

        {/* Independent Upcoming Lots Filter Bar */}
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
          {/* Left Controls */}
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
              <option value="Home & Living">Home & Living</option>
              <option value="Art & Prints">Art & Prints</option>
            </select>

            {/* Starting Bid Range */}
            <select
              value={startingBidRange}
              onChange={(e) => setStartingBidRange(e.target.value)}
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
              <option value="all">All Starting Bids</option>
              <option value="under-80k">Under ₹80,000</option>
              <option value="80k-120k">₹80,000 – ₹120,000</option>
              <option value="above-120k">Above ₹120,000</option>
            </select>

            {/* Seller */}
            {upcomingSellers.length > 0 && (
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
                {upcomingSellers.map((seller) => (
                  <option key={seller} value={seller}>{seller}</option>
                ))}
              </select>
            )}
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
                <option value="soonest">Opening Soonest</option>
                <option value="starting-bid-high">Starting Bid: High to Low</option>
                <option value="starting-bid-low">Starting Bid: Low to High</option>
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
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredUpcoming.length}</strong> scheduled auction lots
          </span>
        </div>

        {/* Upcoming Lots List */}
        {filteredUpcoming.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {filteredUpcoming.map((auction) => {
              const reminderActive = isReminderSet(auction.id);
              const registered = isRegistered(auction.id);
              const isFav = isInWishlist(auction.productId || auction.id);

              return (
                <article
                  key={auction.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '24px'
                  }}
                  className="card-interactive"
                >
                  {/* Left: Thumbnail & Essential Information */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: '1 1 340px' }}>
                    <div
                      style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: 'var(--radius-xs)',
                        overflow: 'hidden',
                        backgroundColor: 'var(--surface-secondary)',
                        flexShrink: 0
                      }}
                    >
                      <img
                        src={auction.thumbnail || auction.image}
                        alt={auction.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="badge-tag">{auction.category}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                          LOT #{auction.id.toUpperCase()}
                        </span>
                      </div>

                      <Link to={`/product/${auction.productId || auction.id}`}>
                        <h3
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '1.3rem',
                            fontWeight: 500,
                            lineHeight: 1.25,
                            margin: '4px 0',
                            color: 'var(--text-primary)'
                          }}
                          className="hover-burgundy"
                        >
                          {auction.name}
                        </h3>
                      </Link>

                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>
                        Atelier:{' '}
                        {auction.sellerId ? (
                          <Link to={`/seller/`} className="hover-burgundy" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            {auction.seller || auction.maker}
                          </Link>
                        ) : (
                          <strong style={{ color: 'var(--text-primary)' }}>{auction.seller || auction.maker}</strong>
                        )}
                      </p>

                      {auction.curatorNote && (
                        <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                          "{auction.curatorNote}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Center: Scheduled Date & Time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '190px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-burgundy)',
                        flexShrink: 0
                      }}
                    >
                      <Calendar size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block' }}>
                        Opening Session
                      </span>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'block' }}>
                        {auction.scheduledDate}
                      </strong>
                    </div>
                  </div>

                  {/* Starting Bid */}
                  <div style={{ minWidth: '140px' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block' }}>
                      Opening Estimate
                    </span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatINR(auction.startingBid)}
                    </strong>
                  </div>

                  {/* Three Actions Required: Register, Set Reminder, Shop */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* 1. Register Action */}
                    <button
                      onClick={() => toggleRegistration(auction.id)}
                      className={`btn ${registered ? 'btn-primary' : 'btn-burgundy'} btn-sm`}
                      style={{ height: '38px', gap: '6px', fontSize: '12px' }}
                    >
                      {registered ? <Check size={14} /> : null}
                      <span>{registered ? 'Registered' : 'Register'}</span>
                    </button>

                    {/* 2. Set Reminder Action */}
                    <button
                      onClick={() => toggleReminder(auction.id)}
                      className={`btn ${reminderActive ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{ height: '38px', gap: '6px', fontSize: '12px' }}
                    >
                      {reminderActive ? <Check size={14} /> : <Bell size={14} />}
                      <span>{reminderActive ? 'Reminder Set' : 'Set Reminder'}</span>
                    </button>

                    {/* 3. Shop Option (opens associated product's normal details page) */}
                    <Link
                      to={`/product/${auction.productId || auction.id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ height: '38px', gap: '6px', fontSize: '12px' }}
                      title="Inspect full product specs"
                    >
                      <Eye size={14} />
                      <span>Shop Object</span>
                    </Link>

                    {/* Watchlist */}
                    <button
                      onClick={() =>
                        toggleWishlist({
                          id: auction.productId || auction.id,
                          name: auction.name,
                          image: auction.thumbnail,
                          price: auction.startingBid,
                          category: auction.category
                        })
                      }
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isFav ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                      title="Add to Watchlist"
                    >
                      <Heart size={15} fill={isFav ? 'currentColor' : 'none'} strokeWidth={1.75} />
                    </button>
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
              No scheduled lots match your current filters.
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
