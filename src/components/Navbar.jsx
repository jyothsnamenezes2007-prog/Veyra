import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Heart,
  ShoppingBag,
  Calendar,
  User,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Settings,
  Package,
  Gavel,
  Store,
  Clock,
  MessageSquare,
  Bell,
  HelpCircle,
  UserPlus,
  ClipboardList
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { SearchSuggestionsDropdown } from './SearchSuggestionsDropdown';

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchFocused, setIsMobileSearchFocused] = useState(false);

  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const { user, signOut } = useAuth();

  const navigate = useNavigate();

  const handleSignOut = async () => {
    setProfileDropdownOpen(false);
    setMobileMenuOpen(false);
    try {
      const res = await signOut();
      if (res && res.success !== false) {
        navigate('/');
      }
    } catch (err) {
      console.warn('Sign out error:', err);
    }
  };
  const location = useLocation();
  const dropdownRef = useRef(null);
  const searchContainerRef = useRef(null);
  const mobileSearchRef = useRef(null);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
    setIsSearchFocused(false);
    setIsMobileSearchFocused(false);
  }, [location.pathname]);

  // Click outside to close dropdowns and search suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchFocused(false);
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target)) {
        setIsMobileSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setProfileDropdownOpen(false);
        setIsSearchFocused(false);
        setIsMobileSearchFocused(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setIsSearchFocused(false);
    setIsMobileSearchFocused(false);
    setMobileMenuOpen(false);
    const query = searchQuery.trim();
    if (query) {
      navigate(`/shop?search=${encodeURIComponent(query)}`);
    } else {
      navigate('/shop');
    }
  };

  const getInitials = (name) => {
    if (!name || name === 'Complete your profile') return 'VY';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 900,
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid var(--border-color)',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)'
        }}
      >
        {/* ROW 1: Wordmark, Search, and Primary User Actions */}
        <div
          className="container"
          style={{
            height: '74px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'clamp(12px, 2.5vw, 32px)'
          }}
        >
          {/* Left: Mobile Toggle & Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="mobile-nav-toggle"
              style={{
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-primary)',
                padding: '6px'
              }}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <Link
              to="/"
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '2rem',
                letterSpacing: '0.22em',
                fontWeight: 600,
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                display: 'inline-block',
                lineHeight: 1
              }}
            >
              VEYRA
            </Link>
          </div>

          {/* Center: Search Bar (Text input + button, no categories dropdown) */}
          <div
            ref={searchContainerRef}
            className="header-search-container"
            style={{
              flex: '1 1 480px',
              maxWidth: '640px',
              display: 'block',
              position: 'relative'
            }}
          >
            <form
              onSubmit={handleSearchSubmit}
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'var(--bg-primary)',
                overflow: 'hidden',
                transition: 'border-color 150ms ease'
              }}
              className="marketplace-search-form"
            >
              <input
                type="text"
                placeholder="Search distinctive objects, ceramics, living art, live lots..."
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                style={{
                  flex: 1,
                  height: '42px',
                  padding: '0 16px',
                  border: 'none',
                  background: 'transparent',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />

              <button
                type="submit"
                className="btn-burgundy"
                style={{
                  height: '42px',
                  padding: '0 18px',
                  borderRadius: 0,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  cursor: 'pointer'
                }}
                aria-label="Search catalog"
              >
                <Search size={15} />
                <span className="hide-on-mobile">Search</span>
              </button>
            </form>

            <SearchSuggestionsDropdown
              query={searchQuery}
              isOpen={isSearchFocused && Boolean(searchQuery && searchQuery.trim())}
              onClose={() => setIsSearchFocused(false)}
              onSelectSuggestion={(val) => {
                setSearchQuery(val);
                setIsSearchFocused(false);
              }}
            />
          </div>

          {/* Right: Controls (Schedule, Watchlist, Bag, Profile) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(10px, 1.8vw, 22px)',
              flexShrink: 0
            }}
          >
            {/* Schedule Link */}
            <Link
              to="/schedule"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--text-primary)',
                padding: '6px 8px',
                transition: 'color 150ms ease'
              }}
              className="hover-burgundy hide-on-mobile"
              title="Auction Schedule & Reminders"
            >
              <Calendar size={18} strokeWidth={1.75} />
              <span>Schedule</span>
            </Link>

            {/* Watchlist (Heart) Link */}
            <Link
              to="/wishlist"
              aria-label={`Watchlist with ${wishlistCount} items`}
              style={{
                color: 'var(--text-primary)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                transition: 'color 150ms ease'
              }}
              title="Watchlist"
            >
              <Heart size={20} strokeWidth={1.75} />
              {wishlistCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 3px',
                    backgroundColor: 'var(--accent-burgundy)',
                    color: '#FFF',
                    borderRadius: '8px',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700
                  }}
                >
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* Shopping Bag Link with Live Count */}
            <Link
              to="/cart"
              aria-label={`Shopping bag with ${cartCount} items`}
              style={{
                color: 'var(--text-primary)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                transition: 'color 150ms ease'
              }}
              title="Shopping Bag"
            >
              <ShoppingBag size={20} strokeWidth={1.75} />
              {cartCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 3px',
                    backgroundColor: 'var(--btn-primary)',
                    color: '#FFF',
                    borderRadius: '8px',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700
                  }}
                >
                  {cartCount}
                </span>
              )}
            </Link>

            <span style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-color)' }} />

            {/* Profile / Account Control */}
            {user ? (
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  aria-expanded={profileDropdownOpen}
                  aria-haspopup="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 6px',
                    borderRadius: 'var(--radius-xs)',
                    cursor: 'pointer'
                  }}
                  className="profile-button-trigger"
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-burgundy)',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {getInitials(user.name)}
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      maxWidth: '160px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    className="hide-on-mobile"
                  >
                    {user.name}
                  </span>
                  <ChevronDown size={14} color="var(--text-secondary)" />
                </button>

                {/* Etsy-Style Account Dropdown */}
                {profileDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: '280px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.10)',
                      zIndex: 1000,
                      overflow: 'hidden'
                    }}
                  >
                    {/* GROUP 1 - Account Identity */}
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-burgundy)',
                          color: '#FFFFFF',
                          fontSize: '14px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          letterSpacing: '0.04em',
                          flexShrink: 0
                        }}
                      >
                        {getInitials(user.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.name}
                        </strong>
                        <Link
                          to="/account"
                          style={{ fontSize: '12px', color: 'var(--accent-burgundy)', fontWeight: 500, display: 'block', marginTop: '1px' }}
                        >
                          View your profile
                        </Link>
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

                    {/* GROUP 2 - Shopping & Activity */}
                    <div style={{ padding: '6px 0' }}>
                      <Link
                        to="/account?tab=orders"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <Package size={16} color="var(--text-secondary)" />
                        <span>My Purchases & Orders</span>
                      </Link>
                      <Link
                        to="/account?tab=bids"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <Gavel size={16} color="var(--text-secondary)" />
                        <span>My Auctions & Bids</span>
                      </Link>
                      <Link
                        to="/account?tab=notifications"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <Bell size={16} color="var(--text-secondary)" />
                        <span>Notifications</span>
                      </Link>
                      <Link
                        to="/schedule"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <Calendar size={16} color="var(--text-secondary)" />
                        <span>Reservations</span>
                      </Link>
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

                    {/* GROUP 3 - Selling */}
                    <div style={{ padding: '6px 0' }}>
                      <Link
                        to="/sell"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--accent-burgundy)', fontWeight: 600 }}
                        className="dropdown-item"
                      >
                        <Store size={16} color="var(--accent-burgundy)" />
                        <span>Sell on Veyra</span>
                      </Link>
                      <Link
                        to="/my-products"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <ClipboardList size={16} color="var(--text-secondary)" />
                        <span>My Products</span>
                      </Link>
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

                    {/* GROUP 4 - Support & Account */}
                    <div style={{ padding: '6px 0' }}>
                      <Link
                        to="/"
                        onClick={() => setProfileDropdownOpen(false)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <HelpCircle size={16} color="var(--text-secondary)" />
                        <span>Help Centre</span>
                      </Link>
                      <Link
                        to="/account?tab=settings"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '13px', color: 'var(--text-primary)' }}
                        className="dropdown-item"
                      >
                        <Settings size={16} color="var(--text-secondary)" />
                        <span>Account Settings</span>
                      </Link>
                      <button
                        onClick={handleSignOut}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '9px 16px',
                          fontSize: '13px',
                          color: 'var(--error-color)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          background: 'none',
                          border: 'none'
                        }}
                        className="dropdown-item"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

            ) : (
              <Link
                to="/account"
                aria-label="Account"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--text-primary)',
                  padding: '6px'
                }}
                title="Profile & Sign In"
              >
                <User size={20} strokeWidth={1.75} />
                <span className="hide-on-mobile" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                  Account
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* ROW 2: SECONDARY NAVIGATION ROW
            Per specification: Show ONLY these four navigation options:
            1. All Categories — opens complete shop/category browsing page
            2. Shop — opens product marketplace
            3. Live Auctions — opens currently active auctions
            4. Upcoming Lots — opens scheduled future auctions
        */}
        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)'
          }}
        >
          <div
            className="container"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(20px, 4vw, 42px)',
              height: '42px',
              whiteSpace: 'nowrap',
              overflowX: 'auto',
              scrollbarWidth: 'none'
            }}
          >
            <NavLink
              to="/shop"
              className={({ isActive }) =>
                `subnav-link ${isActive ? 'subnav-link-active' : ''}`
              }
              style={{
                fontSize: '13px',
                letterSpacing: '0.04em',
                fontWeight: 500,
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                height: '100%',
                position: 'relative'
              }}
            >
              Shop
            </NavLink>

            <NavLink
              to="/live-auctions"
              className={({ isActive }) =>
                `subnav-link ${isActive ? 'subnav-link-active' : ''}`
              }
              style={{
                fontSize: '13px',
                letterSpacing: '0.04em',
                fontWeight: 600,
                color: 'var(--accent-burgundy)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '100%',
                position: 'relative'
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-burgundy)',
                  display: 'inline-block'
                }}
              />
              <span>Live Auctions</span>
            </NavLink>

            <NavLink
              to="/upcoming-lots"
              className={({ isActive }) =>
                `subnav-link ${isActive ? 'subnav-link-active' : ''}`
              }
              style={{
                fontSize: '13px',
                letterSpacing: '0.04em',
                fontWeight: 500,
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                height: '100%',
                position: 'relative'
              }}
            >
              Upcoming Lots
            </NavLink>
          </div>
        </div>
      </header>

      {/* Accessible Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            backgroundColor: 'rgba(25, 25, 25, 0.5)',
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: '85%',
              maxWidth: '320px',
              backgroundColor: '#FFFFFF',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.12)',
              overflowY: 'auto'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border-color)',
                  marginBottom: '20px'
                }}
              >
                <Link
                  to="/"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.6rem',
                    letterSpacing: '0.18em',
                    fontWeight: 600
                  }}
                >
                  VEYRA
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ padding: '6px', color: 'var(--text-secondary)' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Search */}
              <div ref={mobileSearchRef} style={{ position: 'relative', marginBottom: '24px' }}>
                <form onSubmit={handleSearchSubmit}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '0 10px',
                      backgroundColor: 'var(--bg-primary)'
                    }}
                  >
                    <Search size={15} color="var(--text-secondary)" />
                    <input
                      type="text"
                      placeholder="Search objects..."
                      value={searchQuery}
                      onFocus={() => setIsMobileSearchFocused(true)}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsMobileSearchFocused(true);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 8px',
                        fontSize: '13px',
                        flex: 1,
                        outline: 'none'
                      }}
                    />
                  </div>
                </form>

                <SearchSuggestionsDropdown
                  query={searchQuery}
                  isOpen={isMobileSearchFocused && Boolean(searchQuery && searchQuery.trim())}
                  onClose={() => {
                    setIsMobileSearchFocused(false);
                    setMobileMenuOpen(false);
                  }}
                  onSelectSuggestion={(val) => {
                    setSearchQuery(val);
                    setIsMobileSearchFocused(false);
                    setMobileMenuOpen(false);
                  }}
                />
              </div>

              {/* Navigation Items */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    marginBottom: '6px'
                  }}
                >
                  Navigation
                </span>

                <Link
                  to="/shop"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-primary)'
                  }}
                  className="mobile-item"
                >
                  Shop
                </Link>

                <Link
                  to="/live-auctions"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--accent-burgundy)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  className="mobile-item"
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-burgundy)'
                    }}
                  />
                  <span>Live Auctions</span>
                </Link>

                <Link
                  to="/upcoming-lots"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-primary)'
                  }}
                  className="mobile-item"
                >
                  Upcoming Lots
                </Link>

                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '14px 0' }} />

                <span
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    marginBottom: '6px'
                  }}
                >
                  Collector Tools
                </span>

                <Link
                  to="/schedule"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  className="mobile-item"
                >
                  <Calendar size={16} />
                  <span>Schedule & Reminders</span>
                </Link>

                <Link
                  to="/wishlist"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  className="mobile-item"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Heart size={16} />
                    <span>Watchlist</span>
                  </span>
                  {wishlistCount > 0 && <span className="badge-tag">{wishlistCount}</span>}
                </Link>

                <Link
                  to="/cart"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  className="mobile-item"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingBag size={16} />
                    <span>Shopping Bag</span>
                  </span>
                  {cartCount > 0 && <span className="badge-tag">{cartCount}</span>}
                </Link>

                <Link
                  to="/account"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  className="mobile-item"
                >
                  <User size={16} />
                  <span>Account & Profile</span>
                </Link>

                <Link
                  to="/sell"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '14px',
                    color: 'var(--accent-burgundy)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  className="mobile-item"
                >
                  <Store size={16} />
                  <span>Seller Atelier</span>
                </Link>
              </nav>
            </div>

            {/* Bottom Mobile Action */}
            <div style={{ paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="btn btn-secondary"
                  style={{ width: '100%', height: '40px', fontSize: '13px' }}
                >
                  Sign Out ({user.name})
                </button>
              ) : (
                <Link
                  to="/signin"
                  className="btn btn-burgundy"
                  style={{ width: '100%', height: '40px', fontSize: '13px' }}
                >
                  Sign In to Account
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dropdown-item:hover {
          background-color: var(--bg-primary);
        }
        .subnav-link {
          border-bottom: 2px solid transparent;
          transition: border-color 150ms ease, color 150ms ease;
        }
        .subnav-link:hover {
          color: var(--accent-burgundy) !important;
        }
        .subnav-link-active {
          border-bottom-color: var(--accent-burgundy) !important;
          color: var(--accent-burgundy) !important;
        }
        .mobile-item:hover {
          background-color: var(--bg-primary);
        }
        .hover-burgundy:hover {
          color: var(--accent-burgundy) !important;
        }
        @media (max-width: 860px) {
          .mobile-nav-toggle {
            display: flex !important;
          }
          .header-search-container {
            display: none !important;
          }
          .hide-on-mobile {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
};
