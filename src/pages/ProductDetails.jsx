import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  ShoppingBag,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Clock,
  Hammer,
  Store,
  MapPin,
  Calendar,
  Share2,
  ChevronRight,
  Video,
  Gavel,
  AlertCircle,
  Award,
  Sparkles,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuctions } from '../context/AuctionContext';
import { formatINR } from '../data/products';
import {
  getMeetingAccess,
  getAuthoritativeAuctionWinner,
  getAuthoritativeAuctionStatus,
  formatAuctionCountdown
} from '../data/auctions';
import { ProductGallery } from '../components/ProductGallery';
import { AuctionCallModal } from '../components/AuctionCallModal';

export const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { products, getProductById } = useProducts();
  const { addToCart, recordRecentlyViewed } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { user } = useAuth();
  const {
    liveAuctions,
    upcomingAuctions,
    customAuctions,
    placeBid,
    isReminderSet,
    toggleReminder,
    isRegistered,
    toggleRegistration
  } = useAuctions();

  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);

  // In-page quick bid state for live auctions
  const [quickBidAmount, setQuickBidAmount] = useState('');
  const [quickBidError, setQuickBidError] = useState('');
  const [quickBidSubmitting, setQuickBidSubmitting] = useState(false);

  // Retrieve product or auction
  const product =
    getProductById(id) ||
    products.find((p) => p.id === id || p.auctionId === id || p.upcomingId === id) ||
    customAuctions.find((a) => a.id === id || a.productId === id) ||
    liveAuctions.find((a) => a.id === id || a.productId === id) ||
    upcomingAuctions.find((u) => u.id === id || u.productId === id);

  // Check linked auction data
  const linkedLiveAuction = liveAuctions.find(
    (a) => a.productId === product?.id || a.id === product?.auctionId || a.id === product?.id || a.id === id
  );

  const linkedUpcomingAuction = upcomingAuctions.find(
    (u) => u.productId === product?.id || u.id === product?.upcomingId || u.id === product?.id || u.id === id
  );

  const linkedCustomAuction = customAuctions.find(
    (a) => a.productId === product?.id || a.id === product?.id || a.id === id
  );

  const authoritativeAuction = linkedLiveAuction || linkedUpcomingAuction || linkedCustomAuction;

  const isAuctionType = Boolean(
    authoritativeAuction ||
    product?.isAuction ||
    product?.type === 'auction' ||
    product?.startingBid
  );

  // Record into recently viewed
  useEffect(() => {
    if (product) {
      recordRecentlyViewed(product);
    }
  }, [product?.id]);

  // Synchronize in-page quick bid amount
  useEffect(() => {
    if (authoritativeAuction) {
      const minNext = authoritativeAuction.currentBid + (authoritativeAuction.minIncrement || 500);
      setQuickBidAmount(String(minNext));
    }
  }, [authoritativeAuction?.currentBid, authoritativeAuction?.minIncrement]);

  if (!product) {
    return (
      <div className="container" style={{ paddingTop: '80px', paddingBottom: '80px', textAlign: 'center' }}>
        <h2>Object not found</h2>
        <p style={{ marginTop: '12px', marginBottom: '24px' }}>
          The requested piece could not be located in the Veyra catalog.
        </p>
        <Link to="/shop" className="btn btn-primary">
          Explore Marketplace
        </Link>
      </div>
    );
  }

  const isFavorited = isInWishlist(product.id || authoritativeAuction?.id);

  // Auction lifecycle calculations
  const authState = authoritativeAuction ? getAuthoritativeAuctionStatus(authoritativeAuction) : null;
  const isLive = Boolean(authState && authState.isLive);
  const isUpcoming = Boolean(authState && authState.isUpcoming);
  const isEnded = Boolean(authState && authState.isEnded);
  const remainingSeconds = authState ? authState.remainingSeconds : 0;
  const isPendingApproval =
    authoritativeAuction && authoritativeAuction.approvalStatus === 'pending';

  // Meeting access check
  const meetingAccess = authoritativeAuction
    ? getMeetingAccess(authoritativeAuction, user)
    : { canAccessMeeting: false };

  const winner = authoritativeAuction && isEnded
    ? getAuthoritativeAuctionWinner(authoritativeAuction)
    : null;

  // Handle in-page Quick Bid
  const handleQuickBid = async (e) => {
    e.preventDefault();
    setQuickBidError('');

    if (!user) {
      navigate(`/signin?redirect=${encodeURIComponent(`/product/${product.id}`)}`);
      return;
    }

    const numAmount = Number(quickBidAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setQuickBidError('Please enter a valid bid amount.');
      return;
    }

    setQuickBidSubmitting(true);
    try {
      const outcome = await placeBid(
        authoritativeAuction.id,
        numAmount,
        user.name || user.email || 'Collector',
        user.id
      );

      if (!outcome.success) {
        setQuickBidError(outcome.error || 'Failed to place bid.');
      } else {
        setQuickBidError('');
      }
    } catch (err) {
      setQuickBidError(err.message || 'An error occurred placing bid.');
    } finally {
      setQuickBidSubmitting(false);
    }
  };

  const handleAddToBag = () => {
    addToCart(product, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  // Related products
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id && p.type !== 'auction')
    .slice(0, 4);

  // Format scheduled date
  const formatScheduledDate = (ts) => {
    if (!ts) return 'Scheduled Session';
    const d = new Date(ts);
    return `${d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })} • ${d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })} IST`;
  };

  return (
    <div style={{ paddingTop: '28px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">

        {/* Breadcrumb Navigation */}
        <nav
          aria-label="Breadcrumb"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            marginBottom: '24px',
            flexWrap: 'wrap'
          }}
        >
          <Link to="/" className="hover-burgundy">Home</Link>
          <ChevronRight size={12} />
          {isAuctionType ? (
            <>
              <Link to="/upcoming-lots" className="hover-burgundy">Auctions</Link>
              <ChevronRight size={12} />
              <Link
                to={isLive ? '/live-auctions' : '/upcoming-lots'}
                className="hover-burgundy"
              >
                {isLive ? 'Live Auctions' : 'Upcoming Lots'}
              </Link>
            </>
          ) : (
            <>
              <Link to="/shop" className="hover-burgundy">Shop</Link>
              <ChevronRight size={12} />
              <Link to={`/shop?category=${encodeURIComponent(product.category.toLowerCase())}`} className="hover-burgundy">
                {product.category}
              </Link>
            </>
          )}
          <ChevronRight size={12} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
            {product.name}
          </span>
        </nav>

        {/* AUCTION STATUS BANNER (If Auction Lot) */}
        {isAuctionType && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: isLive
                ? '1.5px solid var(--accent-burgundy)'
                : isUpcoming
                ? '1.5px solid #D4A373'
                : '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              padding: '16px 24px',
              marginBottom: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              boxShadow: isLive ? '0 4px 16px rgba(120, 59, 75, 0.08)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              {isLive ? (
                <span className="badge-live">
                  <span className="dot" />
                  <span>COMPETITIVE BIDDING LIVE</span>
                </span>
              ) : isUpcoming ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '4px 10px',
                    backgroundColor: 'rgba(212, 163, 115, 0.15)',
                    color: '#8C5A24',
                    border: '1px solid rgba(212, 163, 115, 0.4)',
                    borderRadius: 'var(--radius-xs)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <Clock size={12} />
                  UPCOMING CATALOGUE LOT
                </span>
              ) : isEnded ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '4px 10px',
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--text-primary)',
                    borderRadius: 'var(--radius-xs)'
                  }}
                >
                  AUCTION CONCLUDED
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '4px 10px',
                    backgroundColor: 'rgba(234, 228, 220, 0.7)',
                    color: '#7A6A56',
                    borderRadius: 'var(--radius-xs)'
                  }}
                >
                  PENDING CURATOR APPROVAL
                </span>
              )}

              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {isLive ? (
                  <span>
                    Current High Bid: <strong>{formatINR(authoritativeAuction?.currentBid || 0)}</strong> • Closes in{' '}
                    <strong style={{ color: 'var(--accent-burgundy)' }}>{formatCountdown(remainingSeconds)}</strong>
                  </span>
                ) : isUpcoming ? (
                  <span>
                    Opens on <strong>{formatScheduledDate(startTs)}</strong> • Countdown:{' '}
                    <strong style={{ color: '#8C5A24' }}>{formatCountdown(remainingSeconds)}</strong>
                  </span>
                ) : isEnded ? (
                  <span>
                    Final Hammer Price: <strong>{formatINR(authoritativeAuction?.currentBid || 0)}</strong>{' '}
                    {winner ? `• Won by ${winner.bidder}` : '• No qualifying bids recorded'}
                  </span>
                ) : (
                  <span>Listing is queued for atelier verification before being scheduled.</span>
                )}
              </div>
            </div>

            {/* Context-sensitive Banner Action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isLive && (
                <Link
                  to={`/live/${authoritativeAuction.id}`}
                  className="btn btn-burgundy btn-sm"
                  style={{ fontWeight: 600, gap: '6px' }}
                >
                  <Hammer size={14} />
                  <span>Enter Live Room</span>
                </Link>
              )}
              {isEnded && meetingAccess.canAccessMeeting && (
                <button
                  onClick={() => setCallModalOpen(true)}
                  className="btn btn-burgundy btn-sm"
                  style={{ fontWeight: 600, gap: '6px' }}
                >
                  <Video size={14} />
                  <span>{meetingAccess.buttonLabel}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* MAIN PRODUCT CATALOGUE LAYOUT */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 'clamp(32px, 5vw, 64px)',
            alignItems: 'flex-start',
            marginBottom: '72px'
          }}
        >
          {/* ========================================================
              LEFT COLUMN: Product Imagery, Editorial Note, Specs & Certification
              ======================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* 1. Large Image Gallery with Thumbnails & Count */}
            <div>
              <ProductGallery
                images={product.images || [product.image]}
                fallbackImage={product.image}
                alt={product.name}
                aspectRatio="4 / 3"
              />
            </div>

            {/* 2. Editorial Note & Narrative */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '24px 28px'
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1.35rem',
                  fontWeight: 600,
                  margin: '0 0 12px 0',
                  color: 'var(--text-primary)'
                }}
              >
                Editorial Note & Narrative
              </h2>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.75,
                  color: 'var(--text-secondary)',
                  margin: 0
                }}
              >
                {product.description || 'Authentic handcrafted studio masterwork documenting artisanal material culture and provenance.'}
              </p>
            </div>

            {/* 3. Provenance & Archival Certification (Only when supplied and verified) */}
            {(product.provenance || product.authenticityCertificate) && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '24px 28px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <ShieldCheck size={20} color="var(--accent-burgundy)" />
                  <h3
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      margin: 0,
                      color: 'var(--text-primary)'
                    }}
                  >
                    Provenance & Archival Certification
                  </h3>
                </div>

                {product.provenance && (
                  <div style={{ marginBottom: product.authenticityCertificate ? '12px' : 0 }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                      Archival Provenance
                    </span>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                      {product.provenance}
                    </p>
                  </div>
                )}

                {product.authenticityCertificate && (
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, marginBottom: '2px' }}>
                      Certification Hallmark
                    </span>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                      {product.authenticityCertificate}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 4. Physical Specifications Grid */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '24px 28px'
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  margin: '0 0 16px 0',
                  color: 'var(--text-primary)'
                }}
              >
                Physical Specifications
              </h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '16px',
                  fontSize: '13px'
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Condition State
                  </span>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                    {product.condition || 'Pristine Studio Original'}
                  </strong>
                </div>

                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Availability
                  </span>
                  <strong style={{ color: isAuctionType ? 'var(--accent-burgundy)' : 'var(--success-color)', display: 'block', marginTop: '2px' }}>
                    {isAuctionType
                      ? isLive
                        ? 'Active in Live Auction'
                        : isUpcoming
                        ? 'Scheduled for Upcoming Lot'
                        : 'Concluded Lot'
                      : product.availability || 'In Stock • Studio Direct'}
                  </strong>
                </div>

                {product.materials && (
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.05em', fontWeight: 600 }}>
                      Materials
                    </span>
                    <span style={{ color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                      {product.materials}
                    </span>
                  </div>
                )}

                {product.dimensions && (
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.05em', fontWeight: 600 }}>
                      Dimensions
                    </span>
                    <span style={{ color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                      {product.dimensions}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================
              RIGHT COLUMN: Title, Pricing, Valuation, Schedule, Bidding / Purchasing
              ======================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Eyebrow & Reference ID */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="eyebrow" style={{ margin: 0 }}>
                {isAuctionType ? `AUCTION LOT #${(authoritativeAuction?.id || product.id).toUpperCase()}` : product.category}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--surface-secondary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-xs)'
                }}
              >
                REF: {(product.id || authoritativeAuction?.id).slice(0, 14).toUpperCase()}
              </span>
            </div>

            {/* Product Title */}
            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(2rem, 3.2vw, 2.75rem)',
                lineHeight: 1.18,
                marginBottom: '12px',
                color: 'var(--text-primary)',
                fontWeight: 500
              }}
            >
              {product.name}
            </h1>

            {/* Seller & Studio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <Store size={15} color="var(--accent-burgundy)" />
              {product.sellerId ? (
                <Link
                  to={`/seller/${product.sellerId}`}
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 600 }}
                  className="hover-burgundy"
                >
                  {product.seller}
                </Link>
              ) : (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {product.seller}
                </span>
              )}
              {product.location && (
                <>
                  <span style={{ color: 'var(--border-color)' }}>•</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} />
                    {product.location}
                  </span>
                </>
              )}
            </div>

            {/* ========================================================
                CASE 1: LIVE AUCTION LOT (Active competitive bidding)
                ======================================================== */}
            {isAuctionType && isLive && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid var(--accent-burgundy)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '24px',
                  marginBottom: '28px',
                  boxShadow: '0 4px 20px rgba(120, 59, 75, 0.08)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Current Leading Bid
                    </span>
                    <div style={{ fontSize: '2.4rem', fontWeight: 700, color: 'var(--accent-burgundy)', lineHeight: 1.1 }}>
                      {formatINR(authoritativeAuction.currentBid)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Time Remaining
                    </span>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {formatAuctionCountdown(remainingSeconds)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '18px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <span>Min Increment: <strong>{formatINR(authoritativeAuction.minIncrement || 500)}</strong></span>
                  <span>Minimum Next Bid: <strong>{formatINR(authoritativeAuction.currentBid + (authoritativeAuction.minIncrement || 500))}</strong></span>
                  <span>Bids: <strong>{authoritativeAuction.bidCount || 0}</strong></span>
                </div>

                {/* In-Page Quick Bid Form */}
                <form onSubmit={handleQuickBid} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      min={authoritativeAuction.currentBid + (authoritativeAuction.minIncrement || 500)}
                      step={authoritativeAuction.minIncrement || 500}
                      className="form-input"
                      value={quickBidAmount}
                      onChange={(e) => setQuickBidAmount(e.target.value)}
                      placeholder="Enter bid amount in ₹"
                      style={{ fontSize: '14px', fontWeight: 600, height: '46px' }}
                    />
                    <button
                      type="submit"
                      className="btn btn-burgundy"
                      disabled={quickBidSubmitting}
                      style={{ minWidth: '130px', height: '46px', fontWeight: 600 }}
                    >
                      {quickBidSubmitting ? 'Placing...' : 'Place Bid'}
                    </button>
                  </div>

                  {/* Quick Raise Chips */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Quick Raise:</span>
                    {[500, 1000, 2500, 5000].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => setQuickBidAmount(String(authoritativeAuction.currentBid + inc))}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--surface-secondary)',
                          cursor: 'pointer',
                          fontWeight: 500
                        }}
                      >
                        +{formatINR(inc)}
                      </button>
                    ))}
                  </div>

                  {quickBidError && (
                    <div style={{ color: 'var(--error-color)', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AlertCircle size={13} />
                      <span>{quickBidError}</span>
                    </div>
                  )}
                </form>

                {/* Synchronized Room Link */}
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', gap: '10px' }}>
                  <Link
                    to={`/live/${authoritativeAuction.id}`}
                    className="btn btn-secondary"
                    style={{ flex: 1, height: '42px', fontSize: '13px', fontWeight: 600, gap: '6px' }}
                  >
                    <Hammer size={15} />
                    <span>Enter Live Synchronized Room</span>
                  </Link>

                  <button
                    onClick={() => toggleWishlist(product)}
                    className="btn btn-secondary"
                    style={{ width: '42px', height: '42px', padding: 0 }}
                    title="Watchlist"
                  >
                    <Heart size={16} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================
                CASE 2: UPCOMING AUCTION LOT (Scheduled in the future)
                ======================================================== */}
            {isAuctionType && isUpcoming && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D4A373',
                  borderRadius: 'var(--radius-xs)',
                  padding: '24px',
                  marginBottom: '28px'
                }}
              >
                {/* Valuation & Starting Bid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>
                      Starting Lot Bid
                    </span>
                    <strong style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>
                      {formatINR(authoritativeAuction.startingBid)}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>
                      Estimated Valuation
                    </span>
                    <strong style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
                      {formatINR(authoritativeAuction.estimatedValue || authoritativeAuction.price || authoritativeAuction.startingBid)}
                    </strong>
                  </div>
                </div>

                {/* Schedule & Countdown Box */}
                <div
                  style={{
                    backgroundColor: 'rgba(212, 163, 115, 0.08)',
                    border: '1px solid rgba(212, 163, 115, 0.3)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '14px 16px',
                    marginBottom: '20px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Calendar size={15} color="#8C5A24" />
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#8C5A24' }}>
                      {formatScheduledDate(startTs)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={15} color="#8C5A24" />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      Bidding commences in: <strong>{formatAuctionCountdown(remainingSeconds)}</strong>
                    </span>
                  </div>
                </div>

                {/* Action Buttons: Register & Remind */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => toggleRegistration(authoritativeAuction.id)}
                    className={`btn ${isRegistered(authoritativeAuction.id) ? 'btn-primary' : 'btn-burgundy'}`}
                    style={{ flex: 1, minWidth: '180px', height: '46px', fontSize: '13px', fontWeight: 600 }}
                  >
                    {isRegistered(authoritativeAuction.id) ? 'Bidding Pass Active' : 'Register for Upcoming Lot'}
                  </button>

                  <button
                    onClick={() => toggleReminder(authoritativeAuction.id)}
                    className="btn btn-secondary"
                    style={{ height: '46px', padding: '0 18px', fontSize: '13px' }}
                  >
                    <Calendar size={15} />
                    <span>{isReminderSet(authoritativeAuction.id) ? 'Reminder Set' : 'Set Reminder'}</span>
                  </button>

                  <button
                    onClick={() => toggleWishlist(product)}
                    className="btn btn-secondary"
                    style={{ width: '46px', height: '46px', padding: 0 }}
                    title="Watchlist"
                  >
                    <Heart size={18} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
                  </button>
                </div>

                <p style={{ margin: '14px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Bidding opens automatically at the scheduled start time. No early bids are accepted.
                </p>
              </div>
            )}

            {/* ========================================================
                CASE 3: CONCLUDED AUCTION LOT
                ======================================================== */}
            {isAuctionType && isEnded && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '24px',
                  marginBottom: '28px'
                }}
              >
                <div style={{ marginBottom: '14px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>
                    Final Hammer Result
                  </span>
                  <div style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatINR(authoritativeAuction.currentBid)}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {winner ? (
                      <span>Winning Collector: <strong style={{ color: 'var(--text-primary)' }}>{winner.bidder}</strong></span>
                    ) : (
                      <span>Concluded without qualifying bids.</span>
                    )}
                  </div>
                </div>

                {/* Winner-Only Meeting Card */}
                {meetingAccess.canAccessMeeting ? (
                  <div style={{ backgroundColor: 'rgba(120, 59, 75, 0.04)', border: '1px solid rgba(120, 59, 75, 0.25)', borderRadius: 'var(--radius-xs)', padding: '16px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Video size={16} color="var(--accent-burgundy)" />
                      <strong style={{ fontSize: '13px', color: 'var(--accent-burgundy)' }}>
                        Private Post-Auction Video Consultation Available
                      </strong>
                    </div>
                    <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Connect directly in a private, encrypted consultation between buyer and artisan to coordinate white-glove transport.
                    </p>
                    <button
                      onClick={() => setCallModalOpen(true)}
                      className="btn btn-burgundy"
                      style={{ width: '100%', height: '44px', fontWeight: 600, gap: '8px' }}
                    >
                      <Video size={16} />
                      <span>{meetingAccess.buttonLabel}</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <Link
                      to={`/live/${authoritativeAuction.id}`}
                      className="btn btn-secondary"
                      style={{ flex: 1, height: '42px', fontSize: '13px' }}
                    >
                      View Concluded Lot Record
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================
                CASE 4: NORMAL SHOP PRODUCT (Marketplace Direct Purchase)
                ======================================================== */}
            {!isAuctionType && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '24px',
                  marginBottom: '28px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '18px' }}>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>
                      Direct Acquisition Price
                    </span>
                    <strong style={{ fontSize: '2.2rem', color: 'var(--text-primary)' }}>
                      {formatINR(product.price)}
                    </strong>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--success-color)', fontWeight: 600 }}>
                    {product.availability || 'Available for Immediate Dispatch'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {/* Quantity Counter */}
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', height: '46px' }}>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      style={{ width: '36px', height: '100%', fontSize: '16px', color: 'var(--text-secondary)', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <span style={{ width: '32px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      style={{ width: '36px', height: '100%', fontSize: '16px', color: 'var(--text-secondary)', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>

                  {/* Add to Bag Button */}
                  <button
                    onClick={handleAddToBag}
                    className="btn btn-primary"
                    style={{ flex: 1, height: '46px', fontSize: '14px', gap: '8px' }}
                  >
                    {justAdded ? <CheckCircle2 size={16} color="var(--success-color)" /> : <ShoppingBag size={16} />}
                    <span>{justAdded ? 'Added to Bag' : 'Add to Shopping Bag'}</span>
                  </button>

                  {/* Watchlist Button */}
                  <button
                    onClick={() => toggleWishlist(product)}
                    className="btn btn-secondary"
                    style={{ width: '46px', height: '46px', padding: 0 }}
                    title="Save to watchlist"
                  >
                    <Heart size={18} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
                  </button>
                </div>
              </div>
            )}

            {/* Delivery & Authenticity Assurance Badges */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                padding: '16px',
                backgroundColor: 'var(--surface-secondary)',
                borderRadius: 'var(--radius-xs)',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={16} color="var(--accent-burgundy)" />
                <span>Museum-Grade Insured Delivery</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} color="var(--accent-burgundy)" />
                <span>100% Provenance Guarantee</span>
              </div>
            </div>
          </div>
        </div>

        {/* RELATED / SIMILAR OBJECTS */}
        {relatedProducts.length > 0 && (
          <section style={{ borderTop: '1px solid var(--border-color)', paddingTop: '48px' }}>
            <div style={{ marginBottom: '28px' }}>
              <span className="eyebrow">Complementary Works</span>
              <h2 style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)' }}>More from {product.category}</h2>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '24px'
              }}
            >
              {relatedProducts.map((rel) => (
                <Link
                  key={rel.id}
                  to={`/product/${rel.id}`}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    textDecoration: 'none'
                  }}
                  className="hover-card"
                >
                  <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--surface-secondary)', overflow: 'hidden' }}>
                    <img
                      src={rel.image}
                      alt={rel.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{ padding: '16px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {rel.category}
                    </span>
                    <h4 style={{ fontSize: '14px', margin: '4px 0 8px 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {rel.name}
                    </h4>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatINR(rel.price)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Post-Auction Private Meeting Consultation Modal */}
        {callModalOpen && authoritativeAuction && (
          <AuctionCallModal
            auction={authoritativeAuction}
            currentUser={user}
            onClose={() => setCallModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
};
