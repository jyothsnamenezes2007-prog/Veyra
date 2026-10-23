import React, { useState, useEffect } from 'react';
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
  Video
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuctions } from '../context/AuctionContext';
import { formatINR } from '../data/products';
import { getMeetingAccess } from '../data/auctions';
import { ProductGallery } from '../components/ProductGallery';
import { AuctionCallModal } from '../components/AuctionCallModal';

export const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { products, getProductById } = useProducts();
  const { addToCart, recordRecentlyViewed } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { user } = useAuth();
  const { liveAuctions, upcomingAuctions, isReminderSet, toggleReminder, isRegistered, toggleRegistration } = useAuctions();

  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);

  // Retrieve authoritative product
  const product = getProductById(id) || products.find((p) => p.id === id);

  // Record into recently viewed
  useEffect(() => {
    if (product) {
      recordRecentlyViewed(product);
    }
  }, [product?.id]);

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

  // Check if this product is part of a live auction or upcoming lot
  const linkedLiveAuction = liveAuctions.find(
    (a) => a.productId === product.id || a.id === product.auctionId || a.id === product.id
  );
  const meetingAccess = linkedLiveAuction ? getMeetingAccess(linkedLiveAuction, user) : { canAccessMeeting: false };

  const linkedUpcomingAuction = upcomingAuctions.find(
    (u) => u.productId === product.id || u.id === product.upcomingId || u.id === product.id
  );

  const isFavorited = isInWishlist(product.id);

  const handleAddToBag = () => {
    addToCart(product, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  // Related products
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

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
            marginBottom: '28px',
            flexWrap: 'wrap'
          }}
        >
          <Link to="/" className="hover-burgundy">Home</Link>
          <ChevronRight size={12} />
          <Link to="/shop" className="hover-burgundy">Shop</Link>
          <ChevronRight size={12} />
          <Link to={`/shop?category=${encodeURIComponent(product.category.toLowerCase())}`} className="hover-burgundy">
            {product.category}
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            {product.name}
          </span>
        </nav>

        {/* Back to Live Auction Notice (if navigating from live auction room) */}
        {linkedLiveAuction && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1.5px solid var(--accent-burgundy)',
              borderRadius: 'var(--radius-xs)',
              padding: '14px 20px',
              marginBottom: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge-live">
                <span className="dot" />
                ACTIVE LIVE LOT
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                This piece is currently open for real-time competitive bidding. Current Bid: <strong>{formatINR(linkedLiveAuction.currentBid)}</strong>
              </span>
            </div>

            <Link
              to={`/live/${linkedLiveAuction.id}`}
              className="btn btn-burgundy btn-sm"
              style={{ fontWeight: 600 }}
            >
              <Hammer size={14} />
              <span>Enter Live Bidding Room</span>
            </Link>
          </div>
        )}

        {/* Main Product Layout: 2 Columns (Gallery on Left, Specifications on Right) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 'clamp(32px, 5vw, 64px)',
            alignItems: 'flex-start',
            marginBottom: '72px'
          }}
        >
          {/* LEFT: 5–6 Image Gallery */}
          <div>
            <ProductGallery
              images={product.images || [product.image]}
              fallbackImage={product.image}
              alt={product.name}
              aspectRatio="4 / 3"
            />
          </div>

          {/* RIGHT: Object Details, Condition, Provenance & Purchasing */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Header / Category / ID */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="eyebrow" style={{ margin: 0 }}>
                {product.category}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--surface-secondary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-xs)',
                  letterSpacing: '0.04em'
                }}
              >
                REF: {product.id.toUpperCase()}
              </span>
            </div>

            {/* Title */}
            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'clamp(2rem, 3.2vw, 2.75rem)',
                lineHeight: 1.18,
                marginBottom: '10px',
                color: 'var(--text-primary)'
              }}
            >
              {product.name}
            </h1>

            {/* Seller & Studio — clicking seller name navigates to their shop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Store size={15} color="var(--accent-burgundy)" />
              {product.sellerId ? (
                <Link
                  to={`/seller/${product.sellerId}`}
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}
                  className="hover-burgundy"
                >
                  {product.seller}
                </Link>
              ) : (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
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

            {/* Price or Starting Bid */}
            <div
              style={{
                borderTop: '1px solid var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
                padding: '16px 0',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'baseline',
                gap: '12px'
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em'
                }}
              >
                {formatINR(product.price)}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {linkedLiveAuction ? 'Current High Bid (Live)' : (linkedUpcomingAuction ? 'Starting Lot Valuation' : 'Direct Acquisition Price')}
              </span>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Editorial Note & Narrative</h3>
              <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {product.description}
              </p>
            </div>

            {/* Physical Specifications Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '16px',
                marginBottom: '24px',
                fontSize: '12.5px'
              }}
            >
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}>
                  Condition
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {product.condition || 'Pristine Studio Original'}
                </strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}>
                  Availability
                </span>
                <strong style={{ color: 'var(--success-color)' }}>
                  {product.availability || (product.inStock ? 'Available for Immediate Dispatch' : 'Made to Order')}
                </strong>
              </div>

              {product.materials && (
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}>
                    Materials
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{product.materials}</span>
                </div>
              )}

              {product.dimensions && (
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}>
                    Dimensions
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{product.dimensions}</span>
                </div>
              )}
            </div>

            {/* Authenticity & Provenance Card */}
            {(product.provenance || product.authenticityCertificate) && (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '16px',
                  marginBottom: '28px',
                  fontSize: '12.5px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ShieldCheck size={16} color="var(--accent-burgundy)" />
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    Provenance & Archival Certification
                  </strong>
                </div>
                {product.provenance && (
                  <p style={{ margin: '0 0 6px 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong>Provenance: </strong>{product.provenance}
                  </p>
                )}
                {product.authenticityCertificate && (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong>Certificate: </strong>{product.authenticityCertificate}
                  </p>
                )}
              </div>
            )}

            {/* Purchasing / Bidding Actions */}
            {linkedLiveAuction ? (
              <div style={{ display: 'flex', gap: '12px' }}>
                {meetingAccess.canAccessMeeting ? (
                  <button
                    onClick={() => setCallModalOpen(true)}
                    className="btn btn-burgundy"
                    style={{ flex: 1, height: '46px', fontSize: '14px', gap: '8px', fontWeight: 600 }}
                  >
                    <Video size={16} />
                    <span>{meetingAccess.buttonLabel}</span>
                  </button>
                ) : (
                  <Link
                    to={`/live/${linkedLiveAuction.id}`}
                    className="btn btn-burgundy"
                    style={{ flex: 1, height: '46px', fontSize: '14px', gap: '8px' }}
                  >
                    <Hammer size={16} />
                    <span>
                      {linkedLiveAuction.status === 'ended' || (linkedLiveAuction.remainingSeconds ?? 0) <= 0
                        ? `Auction Concluded (${formatINR(linkedLiveAuction.currentBid)})`
                        : `Enter Live Bidding Room (${formatINR(linkedLiveAuction.currentBid)})`}
                    </span>
                  </Link>
                )}
                <button
                  onClick={() => toggleWishlist(product)}
                  className="btn btn-secondary"
                  style={{ width: '46px', height: '46px', padding: 0 }}
                  title="Save to watchlist"
                >
                  <Heart size={18} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
                </button>
              </div>
            ) : linkedUpcomingAuction ? (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggleRegistration(linkedUpcomingAuction.id)}
                  className={`btn ${isRegistered(linkedUpcomingAuction.id) ? 'btn-primary' : 'btn-burgundy'}`}
                  style={{ flex: 1, height: '46px', fontSize: '13px', minWidth: '180px' }}
                >
                  {isRegistered(linkedUpcomingAuction.id) ? 'Registration Active' : 'Register for Upcoming Lot'}
                </button>
                <button
                  onClick={() => toggleReminder(linkedUpcomingAuction.id)}
                  className="btn btn-secondary"
                  style={{ height: '46px', padding: '0 20px', fontSize: '13px' }}
                >
                  <Calendar size={15} />
                  <span>{isReminderSet(linkedUpcomingAuction.id) ? 'Reminder Set' : 'Set Reminder'}</span>
                </button>
                <button
                  onClick={() => toggleWishlist(product)}
                  className="btn btn-secondary"
                  style={{ width: '46px', height: '46px', padding: 0 }}
                >
                  <Heart size={18} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
                </button>
              </div>
            ) : (
              /* Regular Marketplace Direct Purchase */
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {/* Quantity */}
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', height: '46px' }}>
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    style={{ width: '36px', height: '100%', fontSize: '16px', color: 'var(--text-secondary)' }}
                  >
                    -
                  </button>
                  <span style={{ width: '32px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    style={{ width: '36px', height: '100%', fontSize: '16px', color: 'var(--text-secondary)' }}
                  >
                    +
                  </button>
                </div>

                {/* Add to Bag */}
                <button
                  onClick={handleAddToBag}
                  className="btn btn-primary"
                  style={{ flex: 1, height: '46px', fontSize: '14px', gap: '8px' }}
                >
                  {justAdded ? <CheckCircle2 size={16} color="var(--success-color)" /> : <ShoppingBag size={16} />}
                  <span>{justAdded ? 'Added to Bag' : 'Add to Shopping Bag'}</span>
                </button>

                {/* Watchlist */}
                <button
                  onClick={() => toggleWishlist(product)}
                  className="btn btn-secondary"
                  style={{ width: '46px', height: '46px', padding: 0 }}
                  title="Save to watchlist"
                >
                  <Heart size={18} fill={isFavorited ? 'var(--accent-burgundy)' : 'none'} color={isFavorited ? 'var(--accent-burgundy)' : 'currentColor'} />
                </button>
              </div>
            )}

            {/* Delivery & Assurance note */}
            <div style={{ display: 'flex', gap: '20px', marginTop: '24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Truck size={14} />
                <span>Museum-Grade Insured Shipping</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} />
                <span>100% Authenticity Guarantee</span>
              </span>
            </div>
          </div>
        </div>

        {/* RELATED / SIMILAR OBJECTS */}
        {relatedProducts.length > 0 && (
          <section style={{ borderTop: '1px solid var(--border-color)', paddingTop: '48px' }}>
            <div style={{ marginBottom: '28px' }}>
              <span className="eyebrow">Complementary Works</span>
              <h2 style={{ fontSize: '1.75rem' }}>More from {product.category}</h2>
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
                    flexDirection: 'column'
                  }}
                  className="card-interactive"
                >
                  <div style={{ aspectRatio: '1 / 1', backgroundColor: 'var(--surface-secondary)', overflow: 'hidden' }}>
                    <img src={rel.image} alt={rel.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                    <div>
                      <span className="badge-tag" style={{ marginBottom: '4px' }}>{rel.category}</span>
                      <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', margin: '4px 0' }}>
                        {rel.name}
                      </h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>{rel.seller}</p>
                    </div>
                    <strong style={{ fontSize: '14px', marginTop: '12px', color: 'var(--text-primary)' }}>
                      {formatINR(rel.price)}
                    </strong>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {/* Post-Auction Private Meeting Consultation Modal */}
        {callModalOpen && linkedLiveAuction && (
          <AuctionCallModal
            auction={linkedLiveAuction}
            currentUser={user}
            onClose={() => setCallModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
};
