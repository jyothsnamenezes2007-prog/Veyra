import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Clock,
  Hammer,
  Send,
  MessageSquare,
  Trophy,
  Award,
  Video,
  AlertCircle,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Heart
} from 'lucide-react';
import { useAuctions } from '../context/AuctionContext';
import { useProducts } from '../context/ProductsContext';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { formatINR } from '../data/products';
import { getMeetingAccess, getAuthoritativeAuctionWinner } from '../data/auctions';
import { ProductGallery } from '../components/ProductGallery';
import { AuctionCallModal } from '../components/AuctionCallModal';
import { AdminAuctionControls } from '../components/AdminAuctionControls';
import { ProxyBiddingControls } from '../components/ProxyBiddingControls';

const formatCommentTimestamp = (msg) => {
  if (!msg) return 'Just now';
  const ts = msg.timestamp || msg.createdAt;
  if (!ts) return msg.time || 'Just now';
  const timeNum = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(timeNum) || timeNum <= 0) return msg.time || 'Just now';

  const diffMs = Date.now() - timeNum;
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timeNum).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

export const LiveAuctionRoom = ({ autoOpenMeet = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { liveAuctions, placeBid, comments, sendAuctionComment, fetchAuctionComments, getLeaderboard } = useAuctions();
  const { products } = useProducts();
  const { user } = useAuth();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);
  const [unauthorizedNotice, setUnauthorizedNotice] = useState('');

  // Find authoritative auction
  const auction = liveAuctions.find((a) => a.id === id || a.productId === id) || liveAuctions[0];

  const currentBid = typeof auction?.currentBid === 'number' && !isNaN(auction.currentBid)
    ? auction.currentBid
    : (typeof auction?.startingBid === 'number' && !isNaN(auction.startingBid)
        ? auction.startingBid
        : (Number(auction?.startingBid) || 0));

  const minIncrement = typeof auction?.minIncrement === 'number' && !isNaN(auction.minIncrement) && auction.minIncrement > 0
    ? auction.minIncrement
    : Math.max(500, Math.round(((currentBid || Number(auction?.startingBid) || 0) * 0.05) / 500) * 500);

  const bidCount = typeof auction?.bidCount === 'number' && !isNaN(auction.bidCount)
    ? auction.bidCount
    : (Array.isArray(auction?.bidHistory) ? auction.bidHistory.length : 0);

  const minRequiredBid = auction
    ? (bidCount > 0 ? currentBid + minIncrement : currentBid)
    : 0;

  const [customBid, setCustomBid] = useState('');
  const [bidError, setBidError] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);

  // Sync custom bid when minRequired changes
  useEffect(() => {
    if (minRequiredBid && !isNaN(minRequiredBid)) {
      setCustomBid(String(minRequiredBid));
    }
  }, [minRequiredBid]);

  // Synchronize floor comments from authoritative backend
  useEffect(() => {
    if (auction?.id && fetchAuctionComments) {
      fetchAuctionComments(auction.id);
    }
  }, [auction?.id, fetchAuctionComments]);

  if (!auction) {
    return (
      <div className="container" style={{ paddingTop: '80px', paddingBottom: '80px', textAlign: 'center' }}>
        <h2>Auction lot not found</h2>
        <p style={{ marginTop: '12px', marginBottom: '24px' }}>
          This lot is unavailable or has been archived.
        </p>
        <Link to="/live-auctions" className="btn btn-primary">
          Return to Live Auctions
        </Link>
      </div>
    );
  }

  const isLive = auction.status === 'active' && (auction.remainingSeconds ?? 0) > 0;
  const isUpcoming = auction.status === 'upcoming';
  const isEnded = auction.status === 'ended' || (!isLive && !isUpcoming);
  const isFavorited = isInWishlist(auction.productId || auction.id);

  // Countdown formatter
  const formatCountdown = (totalSeconds) => {
    if (totalSeconds <= 0) return 'Concluded';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  };

  // Chat comments for this specific lot
  // Auto-open WebRTC room if on /meet/:id route or ?meet=true
  useEffect(() => {
    const isMeet = autoOpenMeet || location.pathname.startsWith('/meet/') || searchParams.get('meet') === 'true';
    if (isMeet && auction) {
      if (!user) {
        addToast?.('Please sign in to enter the post-auction consultation room.', 'info');
        navigate(`/signin?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
        return;
      }
      const access = getMeetingAccess(auction, user);
      if (!access.canAccessMeeting) {
        setUnauthorizedNotice(
          access.reason || `Access restricted: Only the winning buyer (${winner?.bidder || 'Winner'}) and seller (${auction.seller || 'Seller'}) may enter this meeting room.`
        );
        setShowUnauthorizedModal(true);
        return;
      }
      setCallModalOpen(true);
    }
  }, [autoOpenMeet, location.pathname, searchParams, auction, user]);

  const handleEnterMeeting = () => {
    if (!user) {
      addToast?.('Please sign in to enter the post-auction consultation room.', 'info');
      navigate(`/signin?redirect=${encodeURIComponent(`/meet/${auction.id}`)}`);
      return;
    }
    const access = getMeetingAccess(auction, user);
    if (!access.canAccessMeeting) {
      setUnauthorizedNotice(
        access.reason || `Access restricted: Only the winning buyer (${winner?.bidder || 'Winner'}) and seller (${auction.seller || 'Seller'}) may enter this meeting room.`
      );
      setShowUnauthorizedModal(true);
      return;
    }
    navigate(`/meet/${auction.id}`);
    setCallModalOpen(true);
  };

  const handleCloseCallModal = () => {
    setCallModalOpen(false);
    if (location.pathname.startsWith('/meet/')) {
      navigate(`/live/${auction.id}`, { replace: true });
    }
  };

  const rawLotComments = (auction && comments[auction.id]) || [];
  const lotComments = useMemo(() => {
    const seen = new Set();
    return rawLotComments.filter((msg) => {
      if (!msg || !msg.id) return false;
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
  }, [rawLotComments]);

  // Ranked Leaderboard
  const leaderboard = getLeaderboard(auction.id);
  const leadingBidder = leaderboard[0];

  // Authoritative Winner and Meeting Access
  const authoritativeWinner = getAuthoritativeAuctionWinner(auction);
  const winner = authoritativeWinner || (!isLive && leaderboard.length > 0 ? leaderboard[0] : null);
  const meetingAccess = getMeetingAccess(auction, user);

  // Determine if current user is authorized to call (retained for backward compatibility)
  const isWinningUser = meetingAccess.isWinningBuyer;
  const isSellerUser = meetingAccess.isSeller;

  // Handle bid submit
  const handleBidSubmit = async (e) => {
    e.preventDefault();
    setBidError('');

    if (!user) {
      setBidError('Please sign in to submit authoritative bids on live lots.');
      return;
    }

    const amountNum = Number(customBid);
    if (isNaN(amountNum) || amountNum < minRequiredBid) {
      setBidError(`Minimum valid bid is ${formatINR(minRequiredBid)}.`);
      return;
    }

    const res = await placeBid(auction.id, amountNum, user.name, user.id);
    if (!res.success) {
      setBidError(res.error || 'Bid rejected by authoritative server.');
    } else {
      setCustomBid(String(amountNum + minIncrement));
    }
  };

  // Quick preset bid buttons
  const handleQuickBid = (incrementValue) => {
    const inc = Number(incrementValue) || minIncrement;
    const calculated = currentBid + inc;
    setCustomBid(String(calculated));
  };

  // Handle chat submit
  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    if (!user) {
      navigate('/signin?redirect=/live/' + auction.id);
      return;
    }

    sendAuctionComment(auction.id, chatMessage, user.name);
    setChatMessage('');
  };

  // Similar products for the left column
  const similarProducts = products
    .filter((p) => p.category === auction.category && p.id !== auction.productId)
    .slice(0, 3);

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: 'calc(100vh - 120px)', paddingBottom: '80px' }}>
      {/* Top Breadcrumb & Live Strip */}
      <div
        style={{
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: '#FFFFFF',
          padding: '12px 0'
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          {/* Back Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link
              to="/live-auctions"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)'
              }}
              className="hover-burgundy"
            >
              <ArrowLeft size={14} />
              <span>All Live Auctions</span>
            </Link>

            <span style={{ color: 'var(--border-color)' }}>/</span>

            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 500 }}>
              LOT #{auction.id.toUpperCase()}
            </span>
          </div>

          {/* Right Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isLive ? (
              <span className="badge-live">
                <span className="dot" />
                <span>Synchronized Room Live</span>
              </span>
            ) : isUpcoming ? (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  padding: '3px 8px',
                  backgroundColor: 'rgba(255, 193, 7, 0.15)',
                  color: '#856404',
                  borderRadius: 'var(--radius-xs)'
                }}
              >
                UPCOMING SESSION
              </span>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  padding: '3px 8px',
                  backgroundColor: 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-xs)'
                }}
              >
                AUCTION CONCLUDED
              </span>
            )}

            <button
              onClick={() => toggleWishlist({ id: auction.productId || auction.id, name: auction.name, image: auction.image, price: auction.currentBid, category: auction.category })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: '#FFFFFF',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Heart size={14} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
              <span>{isFavorited ? 'Saved' : 'Watch'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* THREE-COLUMN AUCTION ROOM CONTAINER */}
      <div className="container" style={{ paddingTop: '20px' }}>
        {/* Administrator Presentation & Demo Controls */}
        <AdminAuctionControls auction={auction} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 320px) minmax(360px, 1fr) minmax(280px, 340px)',
            gap: '24px',
            alignItems: 'flex-start'
          }}
          className="auction-room-grid"
        >
          {/* ========================================================
              LEFT COLUMN: Product Information & Live Comments / Feed
              ======================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top: Product Information */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '20px'
              }}
            >
              <span className="badge-tag" style={{ marginBottom: '8px' }}>
                {auction.category}
              </span>

              <h2
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '1.35rem',
                  lineHeight: 1.25,
                  marginBottom: '6px',
                  color: 'var(--text-primary)'
                }}
              >
                {auction.name}
              </h2>

              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Atelier:{' '}
                {auction.sellerId ? (
                  <Link to={`/seller/${auction.sellerId}`} className="hover-burgundy" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {auction.seller || auction.maker}
                  </Link>
                ) : (
                  <strong style={{ color: 'var(--text-primary)' }}>{auction.seller || auction.maker}</strong>
                )}
              </p>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: 'var(--radius-xs)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--surface-secondary)',
                    flexShrink: 0
                  }}
                >
                  <img
                    src={auction.image}
                    alt={auction.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'block' }}>
                    Reference Lot
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    LOT #{auction.id.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                    {auction.dimensions || 'Archival Object'}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '16px' }}>
                {auction.description}
              </p>

              {/* Provenance Box */}
              {auction.provenance && (
                <div
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-color)',
                    marginBottom: '16px',
                    fontSize: '11.5px',
                    lineHeight: 1.45
                  }}
                >
                  <strong style={{ display: 'block', color: 'var(--accent-burgundy)', marginBottom: '2px' }}>
                    Authenticated Provenance
                  </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{auction.provenance}</span>
                </div>
              )}

              {/* View Full Product Details Link */}
              <Link
                to={`/product/${auction.productId || auction.id}`}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
              >
                <span>View Full Product Details</span>
                <ExternalLink size={13} />
              </Link>
            </div>

            {/* Bottom: Live Auction Chat Feed */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-color)',
                  marginBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={16} color="var(--accent-burgundy)" />
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Auction Floor Notes</h3>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {lotComments.length} messages
                </span>
              </div>

              {/* Messages Scroll Area */}
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  paddingRight: '4px',
                  marginBottom: '14px'
                }}
              >
                {lotComments.length > 0 ? (
                  lotComments.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{msg.user}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{formatCommentTimestamp(msg)}</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {msg.message}
                      </p>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                    No comments yet. Share an inquiry or floor note below.
                  </p>
                )}
              </div>

              {/* Message Input */}
              <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder={user ? "Post a note to the floor..." : "Sign in to post notes"}
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  style={{
                    flex: 1,
                    height: '36px',
                    padding: '0 10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '12px',
                    outline: 'none',
                    backgroundColor: 'var(--bg-primary)'
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-burgundy btn-sm"
                  style={{ height: '36px', padding: '0 12px' }}
                  aria-label="Send floor note"
                >
                  <Send size={13} />
                </button>
              </form>
            </div>

            {/* Compact Similar Products Section */}
            {similarProducts.length > 0 && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '18px'
                }}
              >
                <h4 style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                  Similar Objects in Catalog
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {similarProducts.map((sp) => (
                    <Link
                      key={sp.id}
                      to={`/product/${sp.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '6px',
                        borderRadius: 'var(--radius-xs)',
                        transition: 'background-color 150ms ease'
                      }}
                      className="hover-bg-primary"
                    >
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: 'var(--radius-xs)',
                          overflow: 'hidden',
                          backgroundColor: 'var(--surface-secondary)',
                          flexShrink: 0
                        }}
                      >
                        <img src={sp.image} alt={sp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sp.name}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--accent-burgundy)', fontWeight: 600 }}>
                          {formatINR(sp.price)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================
              CENTER COLUMN: Main Showcase Gallery & Bidding Controls
              ======================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Large 5–6 Image Gallery Frame */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '16px'
              }}
            >
              <ProductGallery
                images={auction.images || [auction.image]}
                fallbackImage={auction.image}
                alt={auction.name}
                aspectRatio="16 / 11"
              />
            </div>

            {/* Bidding Core Arena Card */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: 'clamp(20px, 3vw, 28px)'
              }}
            >
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <span className="eyebrow" style={{ marginBottom: '2px' }}>
                    Authoritative Bidding Hall
                  </span>
                  <h1 style={{ fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)', margin: 0 }}>
                    {auction.name}
                  </h1>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Studio Workshop: <strong>{auction.seller || auction.maker}</strong>
                  </span>
                </div>

                {/* Live Countdown Display */}
                <div
                  style={{
                    backgroundColor: isLive
                      ? 'rgba(120, 59, 75, 0.08)'
                      : isUpcoming
                      ? 'rgba(255, 193, 7, 0.12)'
                      : 'var(--surface-secondary)',
                    border: `1px solid ${
                      isLive
                        ? 'rgba(120, 59, 75, 0.25)'
                        : isUpcoming
                        ? 'rgba(255, 193, 7, 0.35)'
                        : 'var(--border-color)'
                    }`,
                    borderRadius: 'var(--radius-xs)',
                    padding: '8px 14px',
                    textAlign: 'right'
                  }}
                >
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block' }}>
                    {isLive ? 'Time Remaining' : isUpcoming ? 'Bidding Opens In' : 'Auction State'}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: isLive ? 'var(--accent-burgundy)' : isUpcoming ? '#856404' : 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    <Clock size={16} />
                    <span>{formatCountdown(auction.remainingSeconds)}</span>
                  </div>
                </div>
              </div>

              {/* Price & Bid Stats Metric Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '24px'
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                    Current Highest Bid
                  </span>
                  <strong style={{ fontSize: '1.45rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatINR(currentBid)}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                    Minimum Next Bid
                  </span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--accent-burgundy)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatINR(minRequiredBid)}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                    Total Bids Accepted
                  </span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                    {bidCount} Bids
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                    Min Increment
                  </span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>
                    +{formatINR(minIncrement)}
                  </strong>
                </div>
              </div>

              {/* BIDDING CONTROLS OR WINNER ANNOUNCEMENT */}
              {isLive ? (
                <>
                  <form onSubmit={handleBidSubmit}>
                  {/* Suggested Increments */}
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                      Suggested Next Bids
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleQuickBid(minIncrement)}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, minWidth: '100px', fontWeight: 600 }}
                      >
                        +{formatINR(minIncrement)}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickBid(minIncrement * 2)}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, minWidth: '100px', fontWeight: 600 }}
                      >
                        +{formatINR(minIncrement * 2)}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickBid(minIncrement * 4)}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, minWidth: '100px', fontWeight: 600 }}
                      >
                        +{formatINR(minIncrement * 4)}
                      </button>
                    </div>
                  </div>

                  {/* Custom Bid Input & Submit */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      Custom Bid Amount (INR)
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: '12px', top: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                          ₹
                        </span>
                        <input
                          type="number"
                          step={minIncrement}
                          min={minRequiredBid}
                          value={customBid}
                          onChange={(e) => setCustomBid(e.target.value)}
                          placeholder={`Enter at least ${formatINR(minRequiredBid)}`}
                          style={{
                            width: '100%',
                            height: '44px',
                            paddingLeft: '28px',
                            paddingRight: '12px',
                            border: '1.5px solid var(--border-color)',
                            borderRadius: 'var(--radius-xs)',
                            fontSize: '15px',
                            fontWeight: 600,
                            outline: 'none',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="btn btn-burgundy"
                        style={{
                          height: '44px',
                          padding: '0 24px',
                          fontWeight: 600,
                          fontSize: '13px',
                          letterSpacing: '0.04em'
                        }}
                      >
                        <Hammer size={16} />
                        <span>Submit Official Bid</span>
                      </button>
                    </div>

                    {bidError && (
                      <p style={{ color: 'var(--error-color)', fontSize: '12px', marginTop: '6px', margin: '6px 0 0' }}>
                        {bidError}
                      </p>
                    )}
                  </div>

                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                    <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                    Bids are legally binding and synchronized across all Veyra trading terminals.
                  </p>
                </form>
                {/* Auto-bidding Engine Controls */}
                <ProxyBiddingControls auction={auction} />
                </>
              ) : isUpcoming ? (
                <>
                {/* Auction Upcoming Scheduled State */}
                <div
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1.5px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '24px',
                    textAlign: 'center'
                  }}
                >
                  <Clock size={32} color="var(--accent-burgundy)" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '1.3rem', marginBottom: '6px' }}>Auction Scheduled — Opens Soon</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    This lot opens in <strong>{formatCountdown(auction.remainingSeconds)}</strong>. Starting bid is set at <strong>{formatINR(auction.startingBid)}</strong>.
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                    <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                    Terminal bidding controls will activate automatically as soon as the floor countdown concludes.
                  </p>
                </div>
                {/* Auto-bidding Engine Controls */}
                <ProxyBiddingControls auction={auction} />
                </>
              ) : (
                /* Auction Concluded State */
                <div
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1.5px solid var(--accent-burgundy)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '28px 24px',
                    textAlign: 'center'
                  }}
                >
                  <Trophy size={32} color="var(--accent-burgundy)" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '1.4rem', marginBottom: '6px' }}>Auction Successfully Concluded</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
                    Winning Bidder: <strong style={{ color: 'var(--text-primary)' }}>{winner?.bidder || 'Authoritative Bidder'}</strong> with final hammer price of <strong>{formatINR(currentBid)}</strong>.
                  </p>

                  {/* Private Meeting Action Button: Clearly visible "Enter Meeting" (or "Meet Winner" for Seller) */}
                  <div style={{ marginBottom: '16px' }}>
                    <button
                      type="button"
                      onClick={handleEnterMeeting}
                      className="btn btn-burgundy"
                      style={{
                        height: '46px',
                        padding: '0 32px',
                        fontSize: '14px',
                        gap: '8px',
                        fontWeight: 600,
                        boxShadow: '0 2px 8px rgba(120, 59, 75, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      id="post-auction-enter-meeting-btn"
                    >
                      <Video size={18} />
                      <span>{isSellerUser ? 'Meet Winner' : 'Enter Meeting'}</span>
                    </button>
                  </div>

                  {/* Post-auction consultation text placed directly below the button */}
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                    Post-auction private video consultation is reserved for the winning collector and artisan workshop to coordinate provenance, certificate verification, and bespoke shipping details.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================
              RIGHT COLUMN: Maximum Bid & Live Leaderboard
              ======================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top: Current Maximum Bid Card */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className="eyebrow" style={{ margin: 0 }}>
                  High Bid Authority
                </span>
                <span className="badge-tag">
                  {auction.bidCount} Bids Total
                </span>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block' }}>
                  Leading Accepted Amount
                </span>
                <span style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatINR(currentBid)}
                </span>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  padding: '12px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Current Leader:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{leadingBidder?.bidder || 'Singhania A.'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Accepted Time:</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{auction.bidHistory?.[0]?.time || 'Just now'}</span>
                </div>
              </div>

              {/* Collapsible Full Bid Audit History */}
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--accent-burgundy)',
                  cursor: 'pointer'
                }}
              >
                <span>{showHistory ? 'Hide Complete Bid Audit' : 'View Complete Bid Audit'}</span>
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showHistory && (
                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '10px',
                    marginTop: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  {auction.bidHistory && auction.bidHistory.map((bh) => (
                    <div
                      key={bh.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11.5px',
                        padding: '4px 0',
                        borderBottom: '1px dashed var(--border-color)'
                      }}
                    >
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>{bh.bidder}</strong>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>{bh.time}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatINR(bh.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom: Live Leaderboard */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Trophy size={18} color="var(--accent-burgundy)" />
                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Live Leaderboard</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry) => (
                    <div
                      key={entry.rank}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor: entry.isLeading ? 'rgba(120, 59, 75, 0.08)' : 'var(--bg-primary)',
                        border: `1px solid ${entry.isLeading ? 'rgba(120, 59, 75, 0.3)' : 'var(--border-color)'}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: entry.isLeading ? 'var(--accent-burgundy)' : 'var(--surface-secondary)',
                            color: entry.isLeading ? '#FFF' : 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {entry.rank}
                        </span>

                        <div>
                          <span style={{ fontSize: '12.5px', fontWeight: entry.isLeading ? 700 : 500, color: 'var(--text-primary)', display: 'block' }}>
                            {entry.bidder}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            {entry.isLeading ? (isLive ? 'Leading Lot' : 'Confirmed Winner') : 'Active Bidder'}
                          </span>
                        </div>
                      </div>

                      <span style={{ fontSize: '13px', fontWeight: 700, color: entry.isLeading ? 'var(--accent-burgundy)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatINR(entry.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                    No ranked bids registered yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WebRTC Video Call Modal */}
      {callModalOpen && (
        <AuctionCallModal
          auction={auction}
          currentUser={user}
          onClose={handleCloseCallModal}
        />
      )}

      {/* Unauthorized Access Notification Modal */}
      {showUnauthorizedModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            backgroundColor: 'rgba(25, 25, 25, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              maxWidth: '460px',
              width: '100%',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              padding: '32px',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-lavender-bg)',
                color: 'var(--accent-burgundy)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
              Private Consultation Restricted
            </h3>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                marginBottom: '24px'
              }}
            >
              {unauthorizedNotice ||
                `Live video consultations are exclusively reserved for the authoritative winner (${winner?.bidder || 'Winning Collector'}) and the artisan workshop (${auction.seller || 'Artisan Workshop'}).`}
            </p>
            <button
              onClick={() => {
                setShowUnauthorizedModal(false);
                if (location.pathname.startsWith('/meet/')) {
                  navigate(`/live/${auction.id}`, { replace: true });
                }
              }}
              className="btn btn-primary"
              style={{ width: '100%', height: '40px' }}
            >
              Return to Auction Lot
            </button>
          </div>
        </div>
      )}

      <style>{`
        .hover-bg-primary:hover {
          background-color: var(--bg-primary);
        }
        @media (max-width: 1024px) {
          .auction-room-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};
