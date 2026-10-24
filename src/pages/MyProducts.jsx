import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Store,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Gavel,
  Plus,
  ExternalLink,
  Tag,
  Calendar,
  ShieldCheck,
  ChevronDown,
  Save,
  UserCircle,
  Video,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import { useAuctions } from '../context/AuctionContext';
import { useCart } from '../context/CartContext';
import { useSellerProfile } from '../context/SellerProfileContext';
import { formatINR } from '../data/products';
import { getMeetingAccess } from '../data/auctions';
import { AuctionCallModal } from '../components/AuctionCallModal';

// Status config: label, colour tokens, icon
const STATUS_CONFIG = {
  pending: {
    label: 'Pending Approval',
    bg: 'rgba(234, 228, 220, 0.7)',
    text: '#7A6A56',
    border: '#D4C9B8',
    icon: Clock
  },
  scheduled: {
    label: 'Scheduled Lot',
    bg: 'rgba(212, 163, 115, 0.15)',
    text: '#8C5A24',
    border: 'rgba(212, 163, 115, 0.4)',
    icon: Calendar
  },
  active: {
    label: 'Active Listing',
    bg: 'var(--badge-shipping-bg)',
    text: 'var(--badge-shipping-text)',
    border: '#B8D4BE',
    icon: CheckCircle2
  },
  auction: {
    label: 'Live Auction',
    bg: 'rgba(120, 59, 75, 0.08)',
    text: 'var(--accent-burgundy)',
    border: 'rgba(120, 59, 75, 0.25)',
    icon: Gavel
  },
  ended: {
    label: 'Auction Concluded',
    bg: 'var(--surface-secondary)',
    text: 'var(--text-secondary)',
    border: 'var(--border-color)',
    icon: Package
  },
  sold: {
    label: 'Sold',
    bg: 'var(--surface-secondary)',
    text: 'var(--text-secondary)',
    border: 'var(--border-color)',
    icon: Package
  },
  rejected: {
    label: 'Rejected',
    bg: 'rgba(158, 58, 58, 0.08)',
    text: 'var(--error-color)',
    border: 'rgba(158, 58, 58, 0.25)',
    icon: XCircle
  }
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 10px',
        borderRadius: 'var(--radius-xs)',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em'
      }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
};

const formatDate = (iso) => {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return iso;
  }
};

export const MyProducts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { customProducts, updateProductStatus } = useProducts();
  const { liveAuctions, customAuctions, approveAuctionLot, rescheduleAuctionLot, rejectAuctionLot } = useAuctions();
  const { orders } = useCart();
  const { getSellerProfile, updateSellerProfile } = useSellerProfile();

  const [filterStatus, setFilterStatus] = useState('all');
  const [activeMeetingAuction, setActiveMeetingAuction] = useState(null);
  const [rescheduleAuction, setRescheduleAuction] = useState(null);

  // Profile edit panel state
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ displayName: '', aboutMe: '', shopDescription: '', avatarUrl: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Auto-open profile edit panel if ?edit=profile in URL
  useEffect(() => {
    if (searchParams.get('edit') === 'profile') {
      setProfileEditOpen(true);
    }
  }, []);

  // Initialize form from stored profile
  useEffect(() => {
    if (!user) return;
    const profile = getSellerProfile(user.id);
    if (profile) {
      setProfileForm({
        displayName: profile.displayName || user.name || '',
        aboutMe: profile.aboutMe || '',
        shopDescription: profile.shopDescription || '',
        avatarUrl: profile.avatarUrl || ''
      });
    } else {
      setProfileForm((f) => ({ ...f, displayName: user.name || '' }));
    }
  }, [user && user.id]);

  const handleProfileSave = () => {
    setProfileSaving(true);
    updateSellerProfile(user.id, profileForm);
    setTimeout(() => {
      setProfileSaving(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    }, 400);
  };

  // Redirect unauthenticated users
  if (!user) {
    return (
      <div style={{ paddingTop: '64px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
        <div className="container" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--surface-secondary)',
              color: 'var(--accent-burgundy)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}
          >
            <Store size={26} />
          </div>
          <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>Sign In to View Your Listings</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.6 }}>
            Access your seller dashboard to manage and track all your listed products and scheduled auctions.
          </p>
          <Link to="/signin?redirect=/my-products" className="btn btn-burgundy" style={{ height: '44px' }}>
            Sign In to Your Account
          </Link>
        </div>
      </div>
    );
  }

  // Derive authoritative listing status for each product owned by the current user
  const myProducts = useMemo(() => {
    const ownedProducts = customProducts.filter((p) => p.sellerId === user.id);
    const ownedAuctions = customAuctions.filter((a) => a.sellerId === user.id);

    // Merge auctions that might not be in customProducts yet
    const productIds = new Set(ownedProducts.map((p) => p.id));
    const merged = [...ownedProducts];

    ownedAuctions.forEach((auc) => {
      if (!productIds.has(auc.productId) && !productIds.has(auc.id)) {
        merged.push({
          ...auc,
          id: auc.productId || auc.id,
          price: auc.estimatedValue || auc.startingBid,
          listingStatus: auc.approvalStatus,
          isAuction: true,
          type: 'auction'
        });
      }
    });

    const now = Date.now();

    return merged.map((product) => {
      const isAuction = product.isAuction || product.type === 'auction';

      if (isAuction) {
        const matchedAuc =
          customAuctions.find((a) => a.id === product.id || a.productId === product.id || a.id === product.auctionId) ||
          liveAuctions.find((a) => a.id === product.id || a.productId === product.id || a.id === product.auctionId);

        if (matchedAuc) {
          if (matchedAuc.approvalStatus === 'rejected') {
            return { ...product, ...matchedAuc, derivedStatus: 'rejected' };
          }
          if (matchedAuc.approvalStatus === 'pending') {
            return { ...product, ...matchedAuc, derivedStatus: 'pending' };
          }

          // Approved auction: determine lifecycle by server timestamps
          const start = matchedAuc.startTimestamp || matchedAuc.scheduledTimestamp || 0;
          const end = matchedAuc.endTimestamp || matchedAuc.endTime || 0;

          if (now < start) {
            return { ...product, ...matchedAuc, derivedStatus: 'scheduled' };
          } else if (now >= start && (end === 0 || now < end)) {
            return { ...product, ...matchedAuc, derivedStatus: 'auction' };
          } else {
            return { ...product, ...matchedAuc, derivedStatus: 'ended' };
          }
        }
      }

      // Check if product was sold (completed order)
      const soldOrder = orders.find(
        (o) => o.items && o.items.some((item) => item.id === product.id)
      );
      if (soldOrder) {
        return {
          ...product,
          derivedStatus: 'sold',
          saleOrder: soldOrder
        };
      }

      // Standard shop product status
      const stored = product.listingStatus || 'pending';
      return { ...product, derivedStatus: stored };
    });
  }, [customProducts, customAuctions, liveAuctions, user.id, orders]);

  // Status counts for filter tabs
  const counts = useMemo(() => {
    const c = { all: myProducts.length, pending: 0, scheduled: 0, active: 0, auction: 0, ended: 0, sold: 0, rejected: 0 };
    myProducts.forEach((p) => {
      if (c[p.derivedStatus] !== undefined) c[p.derivedStatus]++;
    });
    return c;
  }, [myProducts]);

  const filtered =
    filterStatus === 'all'
      ? myProducts
      : myProducts.filter((p) => p.derivedStatus === filterStatus);

  // Status tabs ordered as specified
  const tabs = [
    { key: 'all', label: 'All Listings' },
    { key: 'pending', label: 'Pending' },
    { key: 'scheduled', label: 'Scheduled Lots' },
    { key: 'active', label: 'Active Shop' },
    { key: 'auction', label: 'Live Auction' },
    { key: 'ended', label: 'Concluded' },
    { key: 'sold', label: 'Sold' },
    { key: 'rejected', label: 'Rejected' }
  ];

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container" style={{ maxWidth: '1120px' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span className="eyebrow" style={{ margin: 0, marginBottom: '6px', display: 'block' }}>Seller Dashboard</span>
            <h1 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: 0, fontFamily: 'var(--font-serif)' }}>
              My Products & Auctions
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {myProducts.length === 0
                ? 'No listings yet. Create your first listing below.'
                : `${myProducts.length} listing${myProducts.length !== 1 ? 's' : ''} across shop products and live auction lots`}
            </p>
          </div>
          <Link
            to="/sell"
            className="btn btn-burgundy"
            style={{ gap: '8px', height: '42px', flexShrink: 0 }}
          >
            <Plus size={15} />
            <span>New Listing</span>
          </Link>
        </div>

        {/* Seller Profile Section */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xs)',
            marginBottom: '28px',
            overflow: 'hidden'
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: profileEditOpen ? '1px solid var(--border-color)' : 'none',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            onClick={() => setProfileEditOpen((o) => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(120,59,75,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <UserCircle size={18} color="var(--accent-burgundy)" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>My Seller Profile</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                  {profileEditOpen ? 'Edit your public shop information' : 'Manage your public shop information'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link
                to={`/seller/${user.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: '12px',
                  color: 'var(--accent-burgundy)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  border: '1px solid rgba(120,59,75,0.25)',
                  borderRadius: 'var(--radius-xs)',
                  textDecoration: 'none'
                }}
              >
                <ExternalLink size={12} />
                View Public Profile
              </Link>
              <ChevronDown
                size={16}
                color="var(--text-secondary)"
                style={{ transform: profileEditOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 200ms ease' }}
              />
            </div>
          </div>

          {/* Edit Form */}
          {profileEditOpen && (
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: '16px', maxWidth: '640px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))}
                    placeholder="Your name or shop name"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-primary)',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    About Me
                  </label>
                  <textarea
                    value={profileForm.aboutMe}
                    onChange={(e) => setProfileForm((f) => ({ ...f, aboutMe: e.target.value }))}
                    placeholder="Tell buyers a bit about yourself..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-primary)',
                      outline: 'none',
                      resize: 'vertical',
                      lineHeight: 1.6,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
                  <button
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    className="btn btn-burgundy btn-sm"
                  >
                    <Save size={13} />
                    <span>{profileSaving ? 'Saving...' : 'Save Profile'}</span>
                  </button>
                  {profileSaved && (
                    <span style={{ fontSize: '12px', color: 'var(--badge-shipping-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> Saved!
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0',
            borderBottom: '2px solid var(--border-color)',
            marginBottom: '28px',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                fontWeight: filterStatus === tab.key ? 600 : 400,
                color: filterStatus === tab.key ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderBottom: filterStatus === tab.key ? '2px solid var(--accent-burgundy)' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 150ms ease'
              }}
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: filterStatus === tab.key ? 'rgba(120,59,75,0.1)' : 'var(--surface-secondary)',
                    color: filterStatus === tab.key ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                  }}
                >
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Empty State */}
        {myProducts.length === 0 && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              padding: '64px 24px',
              textAlign: 'center'
            }}
          >
            <Store size={48} strokeWidth={1} style={{ marginBottom: '16px', opacity: 0.3, color: 'var(--text-secondary)' }} />
            <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No listings yet</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Start selling on Veyra by creating a shop listing or scheduling a live auction.
            </p>
            <Link to="/sell" className="btn btn-burgundy" style={{ gap: '8px' }}>
              <Plus size={14} />
              <span>Create First Listing</span>
            </Link>
          </div>
        )}

        {/* Listings Table */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 140px 140px 130px 100px',
                gap: '12px',
                padding: '10px 16px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderBottom: 'none',
                borderRadius: 'var(--radius-xs) var(--radius-xs) 0 0',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)'
              }}
              className="product-table-header"
            >
              <span>Image</span>
              <span>Object Title</span>
              <span>Price / Lot Bid</span>
              <span>Status</span>
              <span>Listed</span>
              <span>Actions</span>
            </div>

            {filtered.map((product, idx) => (
              <ProductRow
                key={product.id}
                product={product}
                isLast={idx === filtered.length - 1}
                liveAuctions={liveAuctions}
                customAuctions={customAuctions}
                updateProductStatus={updateProductStatus}
                approveAuctionLot={approveAuctionLot}
                rejectAuctionLot={rejectAuctionLot}
                onOpenMeeting={setActiveMeetingAuction}
                onRequireReschedule={setRescheduleAuction}
                currentUser={user}
              />
            ))}
          </div>
        )}

        {/* Reschedule Modal (Safe policy when approving after start time) */}
        {rescheduleAuction && (
          <RescheduleAuctionModal
            auction={rescheduleAuction}
            onClose={() => setRescheduleAuction(null)}
            onReschedule={async (id, scheduleData) => {
              await rescheduleAuctionLot(id, scheduleData);
              setRescheduleAuction(null);
            }}
          />
        )}

        {/* Post-Auction Private Meeting Consultation Modal */}
        {activeMeetingAuction && (
          <AuctionCallModal
            auction={activeMeetingAuction}
            currentUser={user}
            onClose={() => setActiveMeetingAuction(null)}
          />
        )}
      </div>

      <style>{`
        @media (max-width: 720px) {
          .product-table-header {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

// Individual product row in the table
const ProductRow = ({
  product,
  isLast,
  liveAuctions,
  customAuctions,
  updateProductStatus,
  approveAuctionLot,
  rejectAuctionLot,
  onOpenMeeting,
  onRequireReschedule,
  currentUser
}) => {
  const isAuction = product.isAuction || product.type === 'auction';

  const matchedAuction =
    customAuctions.find((a) => a.productId === product.id || a.id === product.id || a.id === product.auctionId) ||
    liveAuctions.find((a) => a.productId === product.id || a.id === product.id || a.id === product.auctionId);

  const meetingAccess =
    matchedAuction && currentUser ? getMeetingAccess(matchedAuction, currentUser) : { canAccessMeeting: false };

  const handleApprove = async () => {
    if (isAuction) {
      const outcome = await approveAuctionLot(product.id);
      if (outcome && outcome.requiresReschedule) {
        onRequireReschedule(matchedAuction || product);
      } else {
        updateProductStatus(product.id, 'active');
      }
    } else {
      updateProductStatus(product.id, 'active');
    }
  };

  const handleReject = () => {
    if (isAuction) {
      rejectAuctionLot(product.id);
    }
    updateProductStatus(product.id, 'rejected');
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderTop: 'none',
        borderRadius: isLast ? '0 0 var(--radius-xs) var(--radius-xs)' : '0',
        transition: 'background-color 120ms ease'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 140px 140px 130px 100px',
          gap: '12px',
          padding: '14px 16px',
          alignItems: 'center'
        }}
        className="product-table-row"
      >
        {/* Thumbnail */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-xs)',
            overflow: 'hidden',
            backgroundColor: 'var(--surface-secondary)',
            flexShrink: 0,
            border: '1px solid var(--border-color)'
          }}
        >
          {product.image ? (
            <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={20} style={{ opacity: 0.3 }} />
            </div>
          )}
        </div>

        {/* Product Info */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{product.category}</span>
            {isAuction ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--accent-burgundy)', fontWeight: 600 }}>
                <Gavel size={11} /> Live Auction Lot
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                <Store size={11} /> Shop Product
              </span>
            )}
          </div>
        </div>

        {/* Price / Starting Bid */}
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {isAuction
            ? `Start ${formatINR(product.startingBid || product.price)}`
            : formatINR(product.price)}
        </div>

        {/* Status */}
        <div>
          <StatusBadge status={product.derivedStatus} />
          {product.derivedStatus === 'pending' && (
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <button
                onClick={handleApprove}
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  border: '1px solid var(--badge-shipping-text)',
                  backgroundColor: 'var(--badge-shipping-bg)',
                  color: 'var(--badge-shipping-text)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Approve
              </button>
              <button
                onClick={handleReject}
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  border: '1px solid rgba(158,58,58,0.3)',
                  backgroundColor: 'rgba(158,58,58,0.07)',
                  color: 'var(--error-color)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Reject
              </button>
            </div>
          )}
        </div>

        {/* Date */}
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={11} />
            {formatDate(product.listedAt || product.submittedAt)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link
            to={`/product/${product.id}`}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', fontSize: '11px', color: 'var(--text-secondary)', gap: '4px' }}
            title="View Catalogue Listing"
          >
            <ExternalLink size={12} />
          </Link>
          {isAuction && matchedAuction && (
            <Link
              to={`/live/${matchedAuction.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1px solid rgba(120,59,75,0.3)', borderRadius: 'var(--radius-xs)', fontSize: '11px', color: 'var(--accent-burgundy)', gap: '4px', fontWeight: 600 }}
              title="Enter Auction Room"
            >
              <Gavel size={12} />
            </Link>
          )}
          {meetingAccess.canAccessMeeting && meetingAccess.buttonLabel === 'Meet Winner' && (
            <button
              onClick={() => onOpenMeeting(matchedAuction)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 10px',
                backgroundColor: 'var(--accent-burgundy)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                fontSize: '11px',
                gap: '5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Meet winning bidder"
            >
              <Video size={12} />
              <span>Meet Winner</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Reschedule Auction Modal (Required when approving after scheduled start time)
const RescheduleAuctionModal = ({ auction, onClose, onReschedule }) => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const fourDays = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(tomorrow);
  const [startTime, setStartTime] = useState('18:00');
  const [endDate, setEndDate] = useState(fourDays);
  const [endTime, setEndTime] = useState('21:00');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const start = new Date(`${startDate}T${startTime}`).getTime();
    const end = new Date(`${endDate}T${endTime}`).getTime();

    if (start <= Date.now()) {
      setError('Start time must be in the future.');
      return;
    }
    if (end <= start) {
      setError('End time must be after the start time.');
      return;
    }

    onReschedule(auction.id || auction.productId, {
      startTimestamp: start,
      endTimestamp: end
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-xs)',
          maxWidth: '480px',
          width: '100%',
          padding: '24px 28px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <AlertCircle size={22} color="var(--accent-burgundy)" />
          <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.35rem' }}>
            Reschedule Overdue Auction
          </h3>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px 0' }}>
          The previously scheduled start time for <strong>"{auction.name}"</strong> has already passed.
          Veyra policy prohibits activating backdated auctions. Please select a valid future schedule before approving:
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Start Date
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input"
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                End Date
              </label>
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-input"
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>

          {error && (
            <div style={{ color: 'var(--error-color)', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button type="submit" className="btn btn-burgundy btn-sm">
              Reschedule & Publish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
