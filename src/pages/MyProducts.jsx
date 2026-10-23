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
  Video
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
  active: {
    label: 'Active Listing',
    bg: 'var(--badge-shipping-bg)',
    text: 'var(--badge-shipping-text)',
    border: '#B8D4BE',
    icon: CheckCircle2
  },
  auction: {
    label: 'Auction in Progress',
    bg: 'rgba(120, 59, 75, 0.08)',
    text: 'var(--accent-burgundy)',
    border: 'rgba(120, 59, 75, 0.25)',
    icon: Gavel
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
    <span style={{
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
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
};

const formatDate = (iso) => {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
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
  const { liveAuctions, approveAuctionLot, rejectAuctionLot } = useAuctions();
  const { orders } = useCart();
  const { getSellerProfile, updateSellerProfile } = useSellerProfile();

  const [filterStatus, setFilterStatus] = useState('all');
  const [activeMeetingAuction, setActiveMeetingAuction] = useState(null);

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
      setProfileForm(f => ({ ...f, displayName: user.name || '' }));
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
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            backgroundColor: 'var(--surface-secondary)', color: 'var(--accent-burgundy)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
          }}>
            <Store size={26} />
          </div>
          <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>Sign In to View Your Listings</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.6 }}>
            Access your seller dashboard to manage and track all your listed products.
          </p>
          <Link to="/signin?redirect=/my-products" className="btn btn-burgundy" style={{ height: '44px' }}>
            Sign In to Your Account
          </Link>
        </div>
      </div>
    );
  }

  // Derive listing status for each product owned by the current user
  const myProducts = useMemo(() => {
    const owned = customProducts.filter(p => p.sellerId === user.id);

    return owned.map(product => {
      // Check if currently in a live auction
      const inAuction = liveAuctions.some(a =>
        a.productId === product.id || a.id === product.id || a.id === product.auctionId
      );
      if (inAuction) return { ...product, derivedStatus: 'auction' };

      // Check if the product was sold (appears in any completed order)
      const soldOrder = orders.find(o =>
        o.items && o.items.some(item => item.id === product.id)
      );
      if (soldOrder) {
        return {
          ...product,
          derivedStatus: 'sold',
          saleOrder: soldOrder
        };
      }

      // Use the stored listingStatus, falling back to pending
      const stored = product.listingStatus || 'pending';
      return { ...product, derivedStatus: stored };
    });
  }, [customProducts, user.id, liveAuctions, orders]);

  // Status counts for filter tabs
  const counts = useMemo(() => {
    const c = { all: myProducts.length, pending: 0, active: 0, auction: 0, sold: 0, rejected: 0 };
    myProducts.forEach(p => { if (c[p.derivedStatus] !== undefined) c[p.derivedStatus]++; });
    return c;
  }, [myProducts]);

  const filtered = filterStatus === 'all'
    ? myProducts
    : myProducts.filter(p => p.derivedStatus === filterStatus);

  // Status tabs ordered as spec
  const tabs = [
    { key: 'all', label: 'All Listings' },
    { key: 'pending', label: 'Pending' },
    { key: 'active', label: 'Active' },
    { key: 'auction', label: 'In Auction' },
    { key: 'sold', label: 'Sold' },
    { key: 'rejected', label: 'Rejected' }
  ];

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container" style={{ maxWidth: '1080px' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span className="eyebrow" style={{ margin: 0, marginBottom: '6px', display: 'block' }}>Seller Dashboard</span>
            <h1 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', margin: 0, fontFamily: 'var(--font-serif)' }}>
              My Products
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {myProducts.length === 0
                ? 'No listings yet. Create your first listing below.'
                : `${myProducts.length} listing${myProducts.length !== 1 ? 's' : ''} across all statuses`}
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
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-xs)',
          marginBottom: '28px',
          overflow: 'hidden'
        }}>
          {/* Panel Header (clickable toggle) */}
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
            onClick={() => setProfileEditOpen(o => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '50%',
                backgroundColor: 'rgba(120,59,75,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
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
                onClick={e => e.stopPropagation()}
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

          {/* Edit Form (collapsible) */}
          {profileEditOpen && (
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: '16px', maxWidth: '640px' }}>

                {/* Display Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={profileForm.displayName}
                    onChange={e => setProfileForm(f => ({ ...f, displayName: e.target.value }))}
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

                {/* About Me */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    About Me
                  </label>
                  <textarea
                    value={profileForm.aboutMe}
                    onChange={e => setProfileForm(f => ({ ...f, aboutMe: e.target.value }))}
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

                {/* Shop Description */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Shop Description
                  </label>
                  <textarea
                    value={profileForm.shopDescription}
                    onChange={e => setProfileForm(f => ({ ...f, shopDescription: e.target.value }))}
                    placeholder="Describe your shop, what you sell, and what makes it unique..."
                    rows={4}
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

                {/* Avatar URL */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Profile Picture URL
                  </label>
                  <input
                    type="url"
                    value={profileForm.avatarUrl}
                    onChange={e => setProfileForm(f => ({ ...f, avatarUrl: e.target.value }))}
                    placeholder="https://example.com/your-photo.jpg"
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
                  {profileForm.avatarUrl && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img
                        src={profileForm.avatarUrl}
                        alt="Preview"
                        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Preview</span>
                    </div>
                  )}
                </div>

                {/* Save Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
                  <button
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '9px 20px',
                      backgroundColor: profileSaving ? 'rgba(120,59,75,0.6)' : 'var(--accent-burgundy)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: profileSaving ? 'not-allowed' : 'pointer',
                      transition: 'all 150ms ease'
                    }}
                  >
                    <Save size={14} />
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                  {profileSaved && (
                    <span style={{ fontSize: '12px', color: 'var(--badge-shipping-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} />
                      Profile saved!
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {myProducts.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '32px'
          }}>
            {[
              { key: 'active', label: 'Active' },
              { key: 'pending', label: 'Pending' },
              { key: 'auction', label: 'In Auction' },
              { key: 'sold', label: 'Sold' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                style={{
                  padding: '14px 16px',
                  backgroundColor: filterStatus === key ? 'rgba(120,59,75,0.05)' : '#FFFFFF',
                  border: filterStatus === key ? '1.5px solid var(--accent-burgundy)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 150ms ease'
                }}
              >
                <span style={{
                  display: 'block', fontSize: '11px', textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: filterStatus === key ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                  fontWeight: 600, marginBottom: '4px'
                }}>{label}</span>
                <strong style={{
                  fontSize: '1.75rem',
                  color: filterStatus === key ? 'var(--accent-burgundy)' : 'var(--text-primary)'
                }}>
                  {counts[key]}
                </strong>
              </button>
            ))}
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{
          display: 'flex', gap: '0', borderBottom: '2px solid var(--border-color)',
          marginBottom: '28px', overflowX: 'auto', scrollbarWidth: 'none'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', fontSize: '13px', whiteSpace: 'nowrap',
                fontWeight: filterStatus === tab.key ? 600 : 400,
                color: filterStatus === tab.key ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: filterStatus === tab.key ? '2px solid var(--accent-burgundy)' : '2px solid transparent',
                marginBottom: '-2px', transition: 'all 150ms ease'
              }}
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px',
                  backgroundColor: filterStatus === tab.key ? 'rgba(120,59,75,0.1)' : 'var(--surface-secondary)',
                  color: filterStatus === tab.key ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                }}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Empty State */}
        {myProducts.length === 0 && (
          <div style={{
            backgroundColor: '#FFFFFF', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xs)', padding: '64px 24px', textAlign: 'center'
          }}>
            <Store size={48} strokeWidth={1} style={{ marginBottom: '16px', opacity: 0.3, color: 'var(--text-secondary)' }} />
            <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>No listings yet</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Start selling on Veyra by creating your first product listing.
            </p>
            <Link to="/sell" className="btn btn-burgundy" style={{ gap: '8px' }}>
              <Plus size={14} />
              <span>Create First Listing</span>
            </Link>
          </div>
        )}

        {/* Filtered Empty */}
        {myProducts.length > 0 && filtered.length === 0 && (
          <div style={{
            backgroundColor: '#FFFFFF', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xs)', padding: '48px 24px', textAlign: 'center'
          }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              No listings with status <strong>"{tabs.find(t => t.key === filterStatus)?.label}"</strong>.
            </p>
            <button onClick={() => setFilterStatus('all')} className="btn btn-secondary" style={{ marginTop: '16px', fontSize: '13px' }}>
              Show All Listings
            </button>
          </div>
        )}

        {/* Listings Table */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 120px 130px 140px 80px',
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
            }} className="product-table-header">
              <span>Image</span>
              <span>Product</span>
              <span>Price</span>
              <span>Status</span>
              <span>Listed</span>
              <span>Actions</span>
            </div>

            {/* Rows */}
            {filtered.map((product, idx) => (
              <ProductRow
                key={product.id}
                product={product}
                isLast={idx === filtered.length - 1}
                liveAuctions={liveAuctions}
                updateProductStatus={updateProductStatus}
                approveAuctionLot={approveAuctionLot}
                rejectAuctionLot={rejectAuctionLot}
                onOpenMeeting={setActiveMeetingAuction}
                currentUser={user}
              />
            ))}
          </div>
        )}

        {/* Sold Products detailed view */}
        {(filterStatus === 'all' || filterStatus === 'sold') && myProducts.some(p => p.derivedStatus === 'sold') && (
          <SoldProductsList products={myProducts.filter(p => p.derivedStatus === 'sold')} />
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
const ProductRow = ({ product, isLast, liveAuctions, updateProductStatus, approveAuctionLot, rejectAuctionLot, onOpenMeeting, currentUser }) => {
  const liveAuction = liveAuctions.find(a =>
    a.productId === product.id || a.id === product.id || a.id === product.auctionId
  );
  const meetingAccess = liveAuction && currentUser ? getMeetingAccess(liveAuction, currentUser) : { canAccessMeeting: false };

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid var(--border-color)',
      borderTop: 'none',
      borderRadius: isLast ? '0 0 var(--radius-xs) var(--radius-xs)' : '0',
      transition: 'background-color 120ms ease'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr 120px 130px 140px 80px',
        gap: '12px',
        padding: '14px 16px',
        alignItems: 'center'
      }} className="product-table-row">
        {/* Thumbnail */}
        <div style={{
          width: '56px', height: '56px', borderRadius: 'var(--radius-xs)',
          overflow: 'hidden', backgroundColor: 'var(--surface-secondary)',
          flexShrink: 0, border: '1px solid var(--border-color)'
        }}>
          {product.image ? (
            <img src={product.image} alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            {product.isAuction && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--accent-burgundy)', fontWeight: 600 }}>
                <Gavel size={10} /> Auction Lot
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {product.isAuction && product.startingBid
            ? `From ${formatINR(product.startingBid)}`
            : formatINR(product.price)}
        </div>

        {/* Status */}
        <div>
          <StatusBadge status={product.derivedStatus} />
          {product.derivedStatus === 'pending' && (
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <button
                onClick={() => { updateProductStatus(product.id, 'active'); if (approveAuctionLot) approveAuctionLot(product.id); }}
                style={{ fontSize: '10px', padding: '2px 8px', border: '1px solid var(--badge-shipping-text)', backgroundColor: 'var(--badge-shipping-bg)', color: 'var(--badge-shipping-text)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontWeight: 600 }}
              >
                Approve
              </button>
              <button
                onClick={() => { updateProductStatus(product.id, 'rejected'); if (rejectAuctionLot) rejectAuctionLot(product.id); }}
                style={{ fontSize: '10px', padding: '2px 8px', border: '1px solid rgba(158,58,58,0.3)', backgroundColor: 'rgba(158,58,58,0.07)', color: 'var(--error-color)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontWeight: 600 }}
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
            {formatDate(product.listedAt)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link
            to={`/product/${product.id}`}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', fontSize: '11px', color: 'var(--text-secondary)', gap: '4px' }}
            title="View listing"
          >
            <ExternalLink size={12} />
          </Link>
          {liveAuction && (
            <Link
              to={`/live/${liveAuction.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', border: '1px solid rgba(120,59,75,0.3)', borderRadius: 'var(--radius-xs)', fontSize: '11px', color: 'var(--accent-burgundy)', gap: '4px', fontWeight: 600 }}
              title="Enter auction"
            >
              <Gavel size={12} />
            </Link>
          )}
          {meetingAccess.canAccessMeeting && meetingAccess.buttonLabel === 'Meet Winner' && (
            <button
              onClick={() => onOpenMeeting(liveAuction)}
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
              title="Meet winning bidder in private WebRTC consultation"
            >
              <Video size={12} />
              <span>Meet Winner</span>
            </button>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .product-table-row {
            grid-template-columns: 56px 1fr !important;
            grid-template-rows: auto auto auto;
          }
        }
      `}</style>
    </div>
  );
};

// Detailed sold products section
const SoldProductsList = ({ products }) => {
  if (products.length === 0) return null;

  return (
    <div style={{ marginTop: '48px' }}>
      <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '1.35rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Package size={20} color="var(--text-secondary)" />
          Completed Sales
        </h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
          Products that have been purchased by collectors.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {products.map(product => {
          const order = product.saleOrder;
          return (
            <div
              key={product.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                flexWrap: 'wrap'
              }}
            >
              <div style={{
                width: '64px', height: '64px', borderRadius: 'var(--radius-xs)',
                overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border-color)'
              }}>
                {product.image
                  ? <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={22} style={{ opacity: 0.3 }} /></div>
                }
              </div>

              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {product.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Tag size={11} />
                    {product.category}
                  </span>
                  {order && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={11} />
                      {order.date}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {formatINR(product.price)}
                </div>
                {order && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Order #{order.id}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', minWidth: '100px' }}>
                <StatusBadge status="sold" />
                {order && (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--badge-shipping-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={11} />
                    {order.status || 'Completed'}
                  </span>
                )}
                <Link
                  to={`/product/${product.id}`}
                  style={{ fontSize: '11px', color: 'var(--accent-burgundy)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  View listing <ExternalLink size={10} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

