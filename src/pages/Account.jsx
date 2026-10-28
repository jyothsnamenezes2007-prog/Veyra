import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  User,
  Package,
  Clock,
  Heart,
  Gavel,
  Calendar,
  Settings,
  LogOut,
  Store,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Edit2,
  Save,
  Phone,
  Mail,
  AlertCircle,
  X,
  Video,
  Trophy,
  Bell,
  CheckCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuctions } from '../context/AuctionContext';
import { useProducts } from '../context/ProductsContext';
import { formatINR } from '../data/products';
import { getMeetingAccess, getAuthoritativeAuctionWinner } from '../data/auctions';
import { AuctionCallModal } from '../components/AuctionCallModal';

export const Account = () => {
  const { user, signOut, updateProfile } = useAuth();
  const { orders, recentlyViewed } = useCart();
  const { items: wishlistItems, removeFromWishlist } = useWishlist();
  const { liveAuctions, upcomingAuctions, userBids, registrations, reminders } = useAuctions();
  const { customProducts } = useProducts();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeMeetingAuction, setActiveMeetingAuction] = useState(null);

  // Edit settings form state
  const [formData, setFormData] = useState({
    name: user?.name || 'Collector',
    username: user?.username || 'collector_user',
    email: user?.email || '',
    phone: user?.phone || '',
    studio: user?.studio || ''
  });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Sync tab with URL
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'messages') {
      setActiveTab('notifications');
    } else if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name && user.name !== 'Complete your profile' ? user.name : '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        studio: user.studio || ''
      });
    }
  }, [user]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    searchParams.set('tab', tabKey);
    setSearchParams(searchParams);
  };

  // Authoritatively finalized auctions won by the current user
  const wonAuctions = useMemo(() => {
    if (!user) return [];
    return liveAuctions.filter((auction) => {
      const access = getMeetingAccess(auction, user);
      return access.canAccessMeeting && access.buttonLabel === 'Enter Meeting';
    });
  }, [liveAuctions, user]);

  // Authoritatively finalized auctions where current user is the seller
  const sellerCompletedAuctions = useMemo(() => {
    if (!user) return [];
    return liveAuctions.filter((auction) => {
      const access = getMeetingAccess(auction, user);
      return access.canAccessMeeting && access.buttonLabel === 'Meet Winner';
    });
  }, [liveAuctions, user]);

  // Read notification state persisted per user
  const notifStorageKey = user ? `veyra_notifs_read_${user.id}` : null;
  const [readNotifIds, setReadNotifIds] = useState(() => {
    if (!user) return [];
    try {
      const saved = localStorage.getItem(`veyra_notifs_read_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const markNotifRead = (id) => {
    setReadNotifIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (notifStorageKey) {
        try { localStorage.setItem(notifStorageKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const markAllNotifsRead = () => {
    const allIds = userNotifications.map((n) => n.id);
    setReadNotifIds(allIds);
    if (notifStorageKey) {
      try { localStorage.setItem(notifStorageKey, JSON.stringify(allIds)); } catch {}
    }
  };

  // Derive authoritative real notifications from user's bids, auctions, sales, and won items
  const userNotifications = useMemo(() => {
    if (!user) return [];
    const notifs = [];

    // 1. Won auctions
    wonAuctions.forEach((won) => {
      notifs.push({
        id: `notif-won-${won.id}`,
        type: 'won',
        title: 'Auction Won',
        actorName: won.seller || won.maker || 'Artisan Workshop',
        message: `Congratulations! Your bid has won the auction for "${won.name}". Connect for your private consultation with the maker.`,
        amount: won.currentBid,
        timestamp: won.endTimestamp || Date.now() - 3600000,
        auctionId: won.id,
        link: `/live/${won.id}`
      });
    });

    // 2. Completed sales where user is seller
    sellerCompletedAuctions.forEach((soldAuc) => {
      const winnerName = soldAuc.winner?.bidder || 'Winning Collector';
      notifs.push({
        id: `notif-sold-${soldAuc.id}`,
        type: 'sold',
        title: 'Lot Sold at Auction',
        actorName: winnerName,
        message: `Your curated lot "${soldAuc.name}" concluded with winning hammer ${formatINR(soldAuc.currentBid)}. Winner: ${winnerName}.`,
        amount: soldAuc.currentBid,
        timestamp: soldAuc.endTimestamp || Date.now() - 3600000,
        auctionId: soldAuc.id,
        link: `/live/${soldAuc.id}`
      });
    });

    // 3. User Bids (Accepted bid and Outbid alerts)
    userBids.forEach((bid) => {
      const matched = liveAuctions.find((a) => a.id === bid.auctionId || a.productId === bid.auctionId);
      const isWon = wonAuctions.some((w) => w.id === bid.auctionId);

      // Bid accepted event
      notifs.push({
        id: `notif-bid-accept-${bid.id}`,
        type: 'bid_accepted',
        title: 'Bid Accepted on Ledger',
        actorName: user.name && user.name !== 'Complete your profile' ? user.name : (user.username || 'You'),
        message: `Your bid of ${formatINR(bid.amount)} on "${bid.auctionTitle}" was verified and placed on the live auction floor.`,
        amount: bid.amount,
        timestamp: bid.timestamp || Date.now() - 7200000,
        auctionId: bid.auctionId,
        link: `/live/${bid.auctionId}`
      });

      // Outbid event
      if (matched && !isWon) {
        const topBidder = matched.bidHistory?.[0]?.bidder || matched.leadingBidder;
        const currentAmount = matched.currentBid || matched.startingBid;
        if (currentAmount > bid.amount) {
          const actor = topBidder && topBidder !== 'undefined' && topBidder !== 'null' ? topBidder : 'Competing Collector';
          notifs.push({
            id: `notif-outbid-${bid.auctionId}-${currentAmount}`,
            type: 'outbid',
            title: 'Outbid Notification',
            actorName: actor,
            message: `${actor} placed a higher bid of ${formatINR(currentAmount)} on "${bid.auctionTitle}". Increase your bid to lead.`,
            amount: currentAmount,
            timestamp: matched.bidHistory?.[0]?.timestamp || (bid.timestamp ? bid.timestamp + 120000 : Date.now() - 1800000),
            auctionId: bid.auctionId,
            link: `/live/${bid.auctionId}`
          });
        }
      }
    });

    // Sort newest first
    notifs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return notifs;
  }, [user, userBids, liveAuctions, wonAuctions, sellerCompletedAuctions]);

  const unreadCount = useMemo(() => {
    return userNotifications.filter((n) => !readNotifIds.includes(n.id)).length;
  }, [userNotifications, readNotifIds]);

  const formatNotifTime = (ts) => {
    if (!ts) return 'Recently';
    const diff = Date.now() - Number(ts);
    if (diff < 0) return 'Just now';
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'Just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    // Validate phone if provided
    if (formData.phone) {
      const digits = formData.phone.replace(/[\s\-().+]/g, '');
      if (!/^\d{7,15}$/.test(digits)) {
        setPhoneError('Please enter a valid phone number (7–15 digits, with country code).');
        return;
      }
    }
    setPhoneError('');
    await updateProfile({
      name: formData.name,
      username: formData.username,
      phone: formData.phone.trim() || null,
      studio: formData.studio
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // If user is guest, present authentication prompt
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
            <User size={26} />
          </div>

          <span className="eyebrow">Collector & Artisan Portal</span>
          <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>Account Access Required</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '28px' }}>
            Please sign in to access your private acquisitions, synchronized bidding history, registered lots, and personal settings.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link to="/signin?redirect=/account" className="btn btn-burgundy" style={{ height: '44px' }}>
              Sign In to Your Account
            </Link>
            <Link to="/signup" className="btn btn-secondary" style={{ height: '44px' }}>
              Create a New Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get initials for profile avatar...
  const getInitials = (name) => {
    if (!name || name === 'Complete your profile') return 'VY';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Nav items per Christie's inspired layout (excluding Interests tab)
  const navTabs = [
    { id: 'overview', label: 'Account Overview', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadCount },
    { id: 'orders', label: 'My Orders & History', icon: Package, count: orders.length },
    { id: 'recent', label: 'Recently Viewed', icon: Clock, count: recentlyViewed.length },
    { id: 'watchlist', label: 'Saved Watchlist', icon: Heart, count: wishlistItems.length },
    { id: 'auctions', label: 'My Auctions', icon: Store, count: customProducts.length },
    { id: 'bids', label: 'My Bids', icon: Gavel, count: userBids.length },
    { id: 'scheduled', label: 'Scheduled Auctions', icon: Calendar, count: registrations.length + reminders.length },
    { id: 'settings', label: 'Settings & Security', icon: Settings }
  ];

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">
        {/* Top Christie's-Inspired Account Profile Banner */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xs)',
            padding: 'clamp(20px, 3.5vw, 32px)',
            marginBottom: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '24px'
          }}
        >
          {/* Avatar & User Details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-burgundy)',
                color: '#FFFFFF',
                fontSize: '1.45rem',
                fontFamily: 'var(--font-serif)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '0.04em',
                flexShrink: 0
              }}
            >
              {getInitials(user.name)}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', margin: 0 }}>
                  {user.name || 'Complete your profile'}
                </h1>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: user.role === 'artisan' || user.role === 'seller' ? 'rgba(120, 59, 75, 0.1)' : 'var(--surface-secondary)',
                    color: user.role === 'artisan' || user.role === 'seller' ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                  }}
                >
                  {user.role === 'artisan' || user.role === 'seller' ? 'Maker Atelier' : 'Collector Member'}
                </span>
                {user.isProfileIncomplete && (
                  <button
                    onClick={() => handleTabChange('settings')}
                    style={{
                      fontSize: '11px',
                      color: 'var(--accent-burgundy)',
                      backgroundColor: 'rgba(120, 59, 75, 0.08)',
                      border: '1px solid rgba(120, 59, 75, 0.2)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      cursor: 'pointer'
                    }}
                  >
                    Please set your full name in Settings
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {user.username && (
                  <>
                    <span>@{user.username}</span>
                    <span style={{ opacity: 0.3 }}>•</span>
                  </>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Mail size={13} />
                  {user.email}
                </span>
                {user.phone && (
                  <>
                    <span style={{ opacity: 0.3 }}>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Phone size={13} />
                      {user.phone}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link to="/sell" className="btn btn-secondary btn-sm" style={{ gap: '6px' }}>
              <Store size={14} color="var(--accent-burgundy)" />
              <span>Seller Atelier</span>
            </Link>

            <button
              onClick={() => handleTabChange('settings')}
              className="btn btn-secondary btn-sm"
              style={{ gap: '6px' }}
            >
              <Edit2 size={13} />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* Two-Column Account Layout: Sidebar Tabs on Left, Content Panel on Right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 280px) 1fr',
            gap: '32px',
            alignItems: 'flex-start'
          }}
          className="account-grid"
        >
          {/* LEFT: Sidebar Navigation Tabs */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Account Navigation
              </span>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column' }}>
              {navTabs.map((tab) => {
                const IconComponent = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '13px 20px',
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                      backgroundColor: isSelected ? 'rgba(120, 59, 75, 0.05)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent-burgundy)' : '3px solid transparent',
                      borderBottom: '1px solid var(--border-color)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 120ms ease'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <IconComponent size={16} color={isSelected ? 'var(--accent-burgundy)' : 'var(--text-secondary)'} />
                      <span>{tab.label}</span>
                    </span>
                    {typeof tab.count === 'number' && tab.count > 0 && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? 'var(--accent-burgundy)' : 'var(--surface-secondary)',
                          color: isSelected ? '#FFFFFF' : 'var(--text-secondary)'
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Sign Out Button */}
              <button
                onClick={signOut}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 20px',
                  fontSize: '13px',
                  color: 'var(--error-color)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderTop: '1px solid var(--border-color)',
                  backgroundColor: 'transparent'
                }}
              >
                <LogOut size={16} />
                <span>Sign Out of VEYRA</span>
              </button>
            </nav>
          </div>

          {/* RIGHT: Active Tab Content Panel */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              padding: 'clamp(24px, 4vw, 36px)',
              minHeight: '480px'
            }}
          >
            {/* TAB: NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Collector Notifications</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Real-time updates on your placed bids, outbid alerts, won auction lots, and completed sales.
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotifsRead}
                      className="btn btn-secondary btn-sm"
                      style={{ gap: '6px', fontSize: '12px', height: '32px' }}
                    >
                      <CheckCheck size={14} />
                      <span>Mark All as Read ({unreadCount})</span>
                    </button>
                  )}
                </div>

                {userNotifications.length === 0 ? (
                  <div
                    style={{
                      padding: '48px 24px',
                      textAlign: 'center',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <Bell size={36} color="var(--text-secondary)" style={{ opacity: 0.35, marginBottom: '14px' }} />
                    <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '6px' }}>No notifications yet</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', lineHeight: 1.6 }}>
                      When you place bids, lead auctions, receive outbid alerts, or win curated lots, your authoritative updates will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {userNotifications.map((notif) => {
                      const isRead = readNotifIds.includes(notif.id);
                      return (
                        <div
                          key={notif.id}
                          onClick={() => markNotifRead(notif.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            padding: '16px 18px',
                            backgroundColor: isRead ? '#FFFFFF' : 'rgba(120, 59, 75, 0.04)',
                            border: `1px solid ${isRead ? 'var(--border-color)' : 'rgba(120, 59, 75, 0.25)'}`,
                            borderRadius: 'var(--radius-xs)',
                            gap: '16px',
                            cursor: 'pointer',
                            transition: 'all 150ms ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                            <div
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '50%',
                                backgroundColor: notif.type === 'won'
                                  ? 'rgba(40, 167, 69, 0.12)'
                                  : notif.type === 'outbid'
                                  ? 'rgba(158, 58, 58, 0.1)'
                                  : 'rgba(120, 59, 75, 0.1)',
                                color: notif.type === 'won'
                                  ? '#1e7e34'
                                  : notif.type === 'outbid'
                                  ? 'var(--error-color)'
                                  : 'var(--accent-burgundy)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: '2px'
                              }}
                            >
                              {notif.type === 'won' ? (
                                <Trophy size={18} />
                              ) : notif.type === 'outbid' ? (
                                <AlertCircle size={18} />
                              ) : notif.type === 'sold' ? (
                                <Store size={18} />
                              ) : (
                                <Gavel size={18} />
                              )}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {notif.title}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    padding: '1px 7px',
                                    borderRadius: '10px',
                                    fontWeight: 600,
                                    backgroundColor: isRead ? 'var(--surface-secondary)' : 'rgba(120, 59, 75, 0.1)',
                                    color: isRead ? 'var(--text-secondary)' : 'var(--accent-burgundy)'
                                  }}
                                >
                                  {notif.actorName}
                                </span>
                                {!isRead && (
                                  <span
                                    style={{
                                      width: '7px',
                                      height: '7px',
                                      borderRadius: '50%',
                                      backgroundColor: 'var(--accent-burgundy)'
                                    }}
                                    title="Unread"
                                  />
                                )}
                              </div>

                              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                                {notif.message}
                              </p>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                                {formatNotifTime(notif.timestamp)}
                              </span>
                            </div>
                          </div>

                          {notif.link && (
                            <Link
                              to={notif.link}
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotifRead(notif.id);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ height: '32px', padding: '0 12px', fontSize: '11.5px', flexShrink: 0 }}
                            >
                              <span>View Lot</span>
                              <ExternalLink size={12} />
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div>
                <div style={{ marginBottom: '28px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Collector Portfolio</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Summary of your authenticated acquisitions, bids, and active catalog sessions.
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '20px',
                    marginBottom: '36px'
                  }}
                >
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                      Orders Completed
                    </span>
                    <strong style={{ fontSize: '1.75rem', color: 'var(--text-primary)' }}>{orders.length}</strong>
                  </div>

                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                      Watchlist Objects
                    </span>
                    <strong style={{ fontSize: '1.75rem', color: 'var(--accent-burgundy)' }}>{wishlistItems.length}</strong>
                  </div>

                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em', display: 'block' }}>
                      Active Lots Bid On
                    </span>
                    <strong style={{ fontSize: '1.75rem', color: 'var(--text-primary)' }}>{userBids.length}</strong>
                  </div>
                </div>

                {/* Recent Orders Preview */}
                <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Recent Order Status</h3>
                {orders.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {orders.slice(0, 2).map((ord) => (
                      <div
                        key={ord.id}
                        style={{
                          padding: '16px',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>
                            Order #{ord.id}
                          </strong>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Placed on {ord.date} • {ord.items.length} item(s)
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="badge-shipping" style={{ marginBottom: '4px', display: 'inline-block' }}>
                            {ord.status}
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>
                            {formatINR(ord.total)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    No acquisitions made yet. Browse our curated shop to place your first order.
                  </p>
                )}
              </div>
            )}

            {/* TAB 2: MY ORDERS & ORDER HISTORY */}
            {activeTab === 'orders' && (
              <div>
                <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>My Orders & Order History</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Documented acquisitions with insured transport and maker authenticity certifications.
                  </p>
                </div>

                {orders.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {orders.map((ord) => (
                      <div
                        key={ord.id}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-xs)',
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{
                            padding: '12px 18px',
                            backgroundColor: 'var(--bg-primary)',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px',
                            fontSize: '12px'
                          }}
                        >
                          <div>
                            <span style={{ color: 'var(--text-secondary)' }}>Order ID: </span>
                            <strong>#{ord.id}</strong>
                            <span style={{ margin: '0 8px', color: 'var(--border-color)' }}>|</span>
                            <span style={{ color: 'var(--text-secondary)' }}>Date: {ord.date}</span>
                          </div>
                          <div>
                            <span className="badge-shipping">{ord.status}</span>
                          </div>
                        </div>

                        <div style={{ padding: '18px' }}>
                          {ord.items.map((item) => (
                            <div key={item.id} style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                              <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-xs)', overflow: 'hidden', backgroundColor: 'var(--surface-secondary)', flexShrink: 0 }}>
                                <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <Link to={`/product/${item.id}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }} className="hover-burgundy">
                                  {item.name}
                                </Link>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                                  Atelier: {item.seller} • Qty: {item.quantity}
                                </span>
                              </div>
                              <strong style={{ fontSize: '13px' }}>{formatINR(item.price * item.quantity)}</strong>
                            </div>
                          ))}

                          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Tracking: {ord.trackingNumber || 'VY-IN-9812499'}</span>
                            <span style={{ fontWeight: 700 }}>Total: {formatINR(ord.total)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No orders on record.</p>
                )}
              </div>
            )}

            {/* TAB 3: PRODUCT HISTORY / RECENTLY VIEWED */}
            {activeTab === 'recent' && (
              <div>
                <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Product History & Recently Viewed</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Objects and curated auction lots inspected during your current collector sessions.
                  </p>
                </div>

                {recentlyViewed.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                    {recentlyViewed.map((item) => (
                      <Link
                        key={item.id}
                        to={`/product/${item.id}`}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-xs)',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        className="card-interactive"
                      >
                        <div style={{ aspectRatio: '1 / 1', backgroundColor: 'var(--surface-secondary)' }}>
                          <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ padding: '12px' }}>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{item.category}</span>
                          <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)', display: 'block', margin: '3px 0' }}>{item.name}</strong>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-burgundy)' }}>{formatINR(item.price)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No recently viewed items recorded.</p>
                )}
              </div>
            )}

            {/* TAB 4: WATCHLIST */}
            {activeTab === 'watchlist' && (
              <div>
                <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Saved Watchlist ({wishlistItems.length})</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Objects and lots saved for contemplation and bidding notifications.
                  </p>
                </div>

                {wishlistItems.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {wishlistItems.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-xs)', overflow: 'hidden', backgroundColor: 'var(--surface-secondary)', flexShrink: 0 }}>
                            <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div>
                            <Link to={`/product/${item.id}`} style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }} className="hover-burgundy">
                              {item.name}
                            </Link>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{item.category}</span>
                            <strong style={{ fontSize: '13px', color: 'var(--accent-burgundy)' }}>{formatINR(item.price)}</strong>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <Link to={`/product/${item.id}`} className="btn btn-secondary btn-sm">
                            View Object
                          </Link>
                          <button
                            onClick={() => removeFromWishlist(item.id)}
                            className="btn btn-subtle btn-sm"
                            style={{ color: 'var(--error-color)' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Your watchlist is empty.</p>
                )}
              </div>
            )}

            {/* TAB 5: MY AUCTIONS */}
            {activeTab === 'auctions' && (
              <div>
                <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>My Auctions & Atelier Listings</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Objects listed by your workshop for direct sale or live competitive bidding.
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <Link to="/sell" className="btn btn-burgundy btn-sm" style={{ gap: '6px' }}>
                    <Store size={14} />
                    <span>Create New Atelier Listing</span>
                  </Link>
                </div>

                {/* Completed Auctions: Meet Winner Section */}
                {sellerCompletedAuctions.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'rgba(120, 59, 75, 0.05)',
                      border: '1px solid rgba(120, 59, 75, 0.25)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '20px',
                      marginBottom: '28px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Video size={18} color="var(--accent-burgundy)" />
                      <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--accent-burgundy)' }}>
                        Completed Auctions — Winner Consultations ({sellerCompletedAuctions.length})
                      </h3>
                    </div>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                      The following auction lots have concluded with a verified winning buyer. Connect directly with the collector in your private WebRTC meeting room.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {sellerCompletedAuctions.map((auc) => {
                        const winner = getAuthoritativeAuctionWinner(auc);
                        return (
                          <div
                            key={auc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '12px',
                              backgroundColor: '#FFFFFF',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-xs)',
                              padding: '14px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <img
                                src={auc.image}
                                alt={auc.name}
                                style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--surface-secondary)' }}
                              />
                              <div>
                                <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)', display: 'block' }}>
                                  {auc.name}
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  Winner: <strong style={{ color: 'var(--accent-burgundy)' }}>{winner?.bidder || 'Winning Collector'}</strong> • Hammer: <strong>{formatINR(auc.currentBid)}</strong>
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <button
                                onClick={() => setActiveMeetingAuction(auc)}
                                className="btn btn-burgundy btn-sm"
                                style={{ gap: '6px', height: '36px', padding: '0 16px', fontWeight: 600 }}
                              >
                                <Video size={14} />
                                <span>Meet Winner</span>
                              </button>

                              <Link to={`/live/${auc.id}`} className="btn btn-secondary btn-sm" style={{ height: '36px' }}>
                                Auction Lot
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {customProducts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {customProducts.map((prod) => (
                      <div
                        key={prod.id}
                        style={{
                          padding: '16px',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-xs)', overflow: 'hidden', backgroundColor: 'var(--surface-secondary)', flexShrink: 0 }}>
                            <img src={prod.image} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <div>
                            <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)', display: 'block' }}>{prod.name}</strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              Category: {prod.category} • Listed: Active in Catalog
                            </span>
                          </div>
                        </div>
                        <strong style={{ fontSize: '14px' }}>{formatINR(prod.price)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-xs)' }}>
                    <Store size={28} color="var(--accent-burgundy)" style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                      No workshop pieces published yet. Use the <strong>Seller Atelier</strong> to list single-edition craft objects.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: MY BIDS */}
            {activeTab === 'bids' && (
              <div>
                <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>My Authoritative Bids ({userBids.length})</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Every bid entered on active lots is tracked with real-time ongoing or outbid status.
                  </p>
                </div>

                {/* Won Auctions Section with "Enter Meeting" Button */}
                {wonAuctions.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'rgba(120, 59, 75, 0.05)',
                      border: '1px solid rgba(120, 59, 75, 0.25)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '20px',
                      marginBottom: '28px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Trophy size={18} color="var(--accent-burgundy)" />
                      <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--accent-burgundy)' }}>
                        Won Auctions & Private Consultations ({wonAuctions.length})
                      </h3>
                    </div>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                      Congratulations! Your bids have won the following completed auction lots. Enter your private WebRTC meeting room to consult directly with the artisan workshop.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {wonAuctions.map((wonLot) => (
                        <div
                          key={wonLot.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '14px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <img
                              src={wonLot.image}
                              alt={wonLot.name}
                              style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--surface-secondary)' }}
                            />
                            <div>
                              <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)', display: 'block' }}>
                                {wonLot.name}
                              </strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                Maker: <strong>{wonLot.seller || wonLot.maker}</strong> • Winning Hammer: <strong>{formatINR(wonLot.currentBid)}</strong>
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                              onClick={() => setActiveMeetingAuction(wonLot)}
                              className="btn btn-burgundy btn-sm"
                              style={{ gap: '6px', height: '36px', padding: '0 16px', fontWeight: 600 }}
                            >
                              <Video size={14} />
                              <span>Enter Meeting</span>
                            </button>

                            <Link to={`/live/${wonLot.id}`} className="btn btn-secondary btn-sm" style={{ height: '36px' }}>
                              Details
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {userBids.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {userBids.map((b) => {
                      const matchedAuction = liveAuctions.find((a) => a.id === b.auctionId || a.productId === b.auctionId);
                      const access = matchedAuction ? getMeetingAccess(matchedAuction, user) : { canAccessMeeting: false };
                      const isWonAndClosed = access.isWinningBuyer && access.canAccessMeeting;

                      return (
                        <div
                          key={b.id}
                          style={{
                            border: isWonAndClosed ? '1.5px solid var(--accent-burgundy)' : '1px solid var(--border-color)',
                            backgroundColor: isWonAndClosed ? '#FFFDFB' : '#FFFFFF',
                            borderRadius: 'var(--radius-xs)',
                            padding: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            {b.image && (
                              <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-xs)', overflow: 'hidden', backgroundColor: 'var(--surface-secondary)', flexShrink: 0 }}>
                                <img src={b.image} alt={b.auctionTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            )}
                            <div>
                              <Link to={`/live/${b.auctionId}`} style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }} className="hover-burgundy">
                                {b.auctionTitle}
                              </Link>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                                Bid placed {b.time}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            <div>
                              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
                                Your Bid
                              </span>
                              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                {formatINR(b.amount)}
                              </strong>
                            </div>

                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: isWonAndClosed
                                  ? 'rgba(40, 167, 69, 0.12)'
                                  : (b.status === 'Leading' || b.status === 'Ongoing')
                                  ? 'var(--badge-shipping-bg)'
                                  : 'rgba(158, 58, 58, 0.1)',
                                color: isWonAndClosed
                                  ? '#1e7e34'
                                  : (b.status === 'Leading' || b.status === 'Ongoing')
                                  ? 'var(--badge-shipping-text)'
                                  : 'var(--error-color)'
                              }}
                            >
                              {isWonAndClosed ? 'Auction Won' : (b.status === 'Leading' ? 'Ongoing' : (b.status === 'Ended' ? 'Concluded' : b.status))}
                            </span>

                            {isWonAndClosed ? (
                              <button
                                onClick={() => setActiveMeetingAuction(matchedAuction)}
                                className="btn btn-burgundy btn-sm"
                                style={{ gap: '6px', height: '34px', padding: '0 14px', fontWeight: 600 }}
                              >
                                <Video size={13} />
                                <span>Enter Meeting</span>
                              </button>
                            ) : (
                              <Link to={`/live/${b.auctionId}`} className="btn btn-secondary btn-sm" style={{ height: '34px' }}>
                                Floor Room
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    You have not placed any bids in live auctions yet.
                  </p>
                )}
              </div>
            )}

            {/* TAB 7: SCHEDULED AUCTIONS */}
            {activeTab === 'scheduled' && (
              <div>
                <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Scheduled Auctions & Reminders</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Forthcoming lots you have registered for or flagged for opening alerts.
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <Link to="/schedule" className="btn btn-secondary btn-sm" style={{ gap: '6px' }}>
                    <Calendar size={13} />
                    <span>Open Comprehensive Calendar View</span>
                  </Link>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {upcomingAuctions
                    .filter((a) => registrations.includes(a.id) || reminders.includes(a.id))
                    .map((auc) => (
                      <div
                        key={auc.id}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-xs)',
                          padding: '14px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '14px'
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)', display: 'block' }}>
                            {auc.name}
                          </strong>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            Session: {auc.scheduledDate} • Starting: {formatINR(auc.startingBid)}
                          </span>
                        </div>
                        <Link to={`/product/${auc.productId || auc.id}`} className="btn btn-secondary btn-sm">
                          Inspect Lot
                        </Link>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB 8: SETTINGS & SECURITY (No Interests tab!) */}
            {activeTab === 'settings' && (
              <div>
                <div style={{ marginBottom: '28px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                  <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Account Settings</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Manage your verified collector credentials, atelier studio designation, and contact details.
                  </p>
                </div>

                {savedSuccess && (
                  <div
                    style={{
                      backgroundColor: 'var(--badge-shipping-bg)',
                      border: '1px solid rgba(56, 107, 73, 0.25)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '12px 16px',
                      marginBottom: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '12.5px',
                      color: 'var(--badge-shipping-text)'
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Account details updated and saved successfully.</span>
                  </div>
                )}

                <form onSubmit={handleProfileSave} style={{ maxWidth: '480px' }}>
                  {/* Full Name */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="name">
                      Full Legal / Collector Name *
                    </label>
                    <input
                      id="name"
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  {/* Username */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="username">
                      Username / Handle (Optional)
                    </label>
                    <input
                      id="username"
                      type="text"
                      className="form-input"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="e.g. nidheesha_h"
                    />
                  </div>

                  {/* Email */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">
                      Email Address (Verified)
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="form-input"
                      value={formData.email}
                      disabled
                      style={{ backgroundColor: 'var(--bg-primary)', cursor: 'not-allowed', color: 'var(--text-secondary)' }}
                    />
                    <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Primary authentication handle managed through secure provider.
                    </span>
                  </div>

                  {/* Phone Number */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="settings-phone">
                      Contact Phone Number
                    </label>
                    <input
                      id="settings-phone"
                      type="tel"
                      className="form-input"
                      value={formData.phone}
                      onChange={(e) => {
                        setFormData({ ...formData, phone: e.target.value });
                        setPhoneError('');
                      }}
                      placeholder="e.g. +91 98201 44820"
                    />
                    {phoneError ? (
                      <span style={{ fontSize: '10.5px', color: 'var(--error-color)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={12} />
                        {phoneError}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Include country code (e.g. +91 for India). Leave blank to remove.
                      </span>
                    )}
                  </div>

                {/* Studio / Maker Designation */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="studio">
                      Artisan Workshop / Atelier Studio (Optional)
                    </label>
                    <input
                      id="studio"
                      type="text"
                      className="form-input"
                      value={formData.studio}
                      onChange={(e) => setFormData({ ...formData, studio: e.target.value })}
                      placeholder="e.g. Atelier Morandi / Studio Vayu"
                    />
                  </div>

                  <div style={{ marginTop: '28px' }}>
                    <button type="submit" className="btn btn-burgundy" style={{ height: '42px', padding: '0 24px', gap: '8px' }}>
                      <Save size={15} />
                      <span>Save Account Changes</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post-Auction Private Meeting Consultation Modal */}
      {activeMeetingAuction && (
        <AuctionCallModal
          auction={activeMeetingAuction}
          currentUser={user}
          onClose={() => setActiveMeetingAuction(null)}
        />
      )}

      <style>{`
        @media (max-width: 860px) {
          .account-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};
