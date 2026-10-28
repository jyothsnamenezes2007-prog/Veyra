import React, { useState, useEffect, useCallback } from 'react';
import { Bot, ShieldCheck, AlertCircle, CheckCircle2, Sliders, X, RefreshCw, PowerOff } from 'lucide-react';
import { formatINR } from '../data/products';
import { useAuctions } from '../context/AuctionContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export const ProxyBiddingControls = ({ auction }) => {
  const { getProxyBidConfig, enableProxyBid, disableProxyBid } = useAuctions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState(null);

  // Form inputs
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

  const [maxBidInput, setMaxBidInput] = useState('');
  const [incrementInput, setIncrementInput] = useState(String(minIncrement));
  const [formError, setFormError] = useState('');

  // Fetch backend proxy config whenever user or auction changes
  const loadBackendConfig = useCallback(async () => {
    if (!auction?.id || !user?.id) {
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const res = await getProxyBidConfig(auction.id, user.id);
      if (res && res.success) {
        setConfig(res.config || null);
        if (res.geminiStatus) {
          setGeminiStatus(res.geminiStatus);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch proxy bid config:', err);
    } finally {
      setLoading(false);
    }
  }, [auction?.id, user?.id, getProxyBidConfig]);

  useEffect(() => {
    loadBackendConfig();
  }, [loadBackendConfig]);

  // Open modal with pre-populated values
  const handleOpenModal = () => {
    if (!user) {
      navigate(`/signin?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setFormError('');
    if (config && config.maxBid) {
      setMaxBidInput(String(config.maxBid));
      setIncrementInput(String(config.preferredIncrement || minIncrement));
    } else {
      setMaxBidInput(String(Math.max(minRequiredBid, currentBid + minIncrement * 2)));
      setIncrementInput(String(minIncrement));
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormError('');
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) handleCloseModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Save / Update proxy bidding settings
  const handleSaveProxySettings = async (e) => {
    e.preventDefault();
    setFormError('');

    const maxBidNum = Number(maxBidInput);
    const incNum = Number(incrementInput);

    // Validation 1: Numbers & positivity
    if (isNaN(maxBidNum) || maxBidNum <= 0) {
      setFormError('Please enter a valid positive maximum bid limit.');
      return;
    }

    if (isNaN(incNum) || incNum <= 0) {
      setFormError('Please enter a valid positive preferred increment.');
      return;
    }

    // Validation 2: Preferred increment >= auction minIncrement
    if (incNum < minIncrement) {
      setFormError(`Preferred increment must be at least the auction minimum of ${formatINR(minIncrement)}.`);
      return;
    }

    // Validation 3: Maximum bid limit >= next valid minimum bid
    if (maxBidNum < minRequiredBid) {
      setFormError(`Maximum limit must be at least ${formatINR(minRequiredBid)} (the next required bid).`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await enableProxyBid(auction.id, {
        maxBid: maxBidNum,
        preferredIncrement: incNum,
        userId: user.id,
        userName: user.name || user.email || 'Collector'
      });

      if (res && res.success) {
        setConfig(res.config);
        if (res.geminiStatus) setGeminiStatus(res.geminiStatus);
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Failed to activate auto-bidding.');
      }
    } catch (err) {
      setFormError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Disable proxy bidding
  const handleDisableProxy = async () => {
    if (!user || !auction?.id) return;
    setSubmitting(true);
    try {
      const res = await disableProxyBid(auction.id, user.id);
      if (res && res.success) {
        setConfig(res.config);
      }
    } catch (err) {
      console.warn('Failed to disable proxy bidding:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!auction) return null;

  const isSeller = user && auction.sellerId && auction.sellerId === user.id;
  const isAuctionActive = auction.status === 'active' || auction.status === 'live';
  const isProxyActive = config && config.status === 'active';
  const isProxyStopped = config && config.status === 'outbid_stopped';
  const isProxyDisabled = config && config.status === 'disabled';

  // Calculate next valid bid and remaining authorized budget
  const effectiveIncrement = Math.max(minIncrement, Number(config?.preferredIncrement) || minIncrement);
  const nextCalculableBid = bidCount > 0 ? currentBid + effectiveIncrement : currentBid;
  const remainingBudget = config?.maxBid ? Math.max(0, Number(config.maxBid) - currentBid) : 0;

  // Seller guard: Sellers cannot proxy bid on their own lot
  if (isSeller) {
    return null;
  }

  return (
    <div style={{ marginTop: '16px', marginBottom: '16px' }}>
      {/* ── State 1: Active or Configured Proxy Bidding Status Dashboard ── */}
      {config && (isProxyActive || isProxyStopped || isProxyDisabled) ? (
        <div
          style={{
            backgroundColor: isProxyActive ? 'rgba(120, 59, 75, 0.04)' : 'var(--bg-primary)',
            border: `1.5px solid ${isProxyActive ? 'var(--accent-burgundy)' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius-xs)',
            padding: '16px 18px',
            position: 'relative'
          }}
          data-testid="proxy-bidding-dashboard"
        >
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="var(--accent-burgundy)" />
              <strong style={{ fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                Auto-bidding
              </strong>
            </div>

            {/* Status Pill strictly confirming backend status */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                backgroundColor: isProxyActive
                  ? 'rgba(42, 92, 59, 0.12)'
                  : isProxyStopped
                  ? 'rgba(158, 58, 58, 0.12)'
                  : 'var(--surface-secondary)',
                color: isProxyActive
                  ? 'var(--success-color)'
                  : isProxyStopped
                  ? 'var(--error-color)'
                  : 'var(--text-secondary)'
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: isProxyActive ? 'var(--success-color)' : isProxyStopped ? 'var(--error-color)' : 'var(--text-secondary)'
                }}
              />
              <span>
                {isProxyActive
                  ? 'Active Authority'
                  : isProxyStopped
                  ? 'Limit Reached / Outbid'
                  : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Metric Grid displaying required status information */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              backgroundColor: '#FFFFFF',
              padding: '12px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-color)',
              marginBottom: '12px'
            }}
          >
            <div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
                Authorized Limit
              </span>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {formatINR(config.maxBid)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
                Preferred Increment
              </span>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                +{formatINR(config.preferredIncrement || minIncrement)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
                Remaining Budget
              </span>
              <strong style={{ fontSize: '13px', color: remainingBudget > 0 ? 'var(--accent-burgundy)' : 'var(--text-secondary)' }}>
                {formatINR(remainingBudget)}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
                Next Valid Bid
              </span>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {formatINR(nextCalculableBid)}
              </strong>
            </div>
          </div>

          {/* Last Result & Explanation for Stopping (if applicable) */}
          {config.lastBidAmount && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 6px' }}>
              Last proxy bid submitted: <strong>{formatINR(config.lastBidAmount)}</strong>
              {config.lastBidTime && ` (${new Date(config.lastBidTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`}
            </p>
          )}

          {config.stopReason && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                backgroundColor: 'rgba(158, 58, 58, 0.08)',
                padding: '8px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid rgba(158, 58, 58, 0.2)',
                fontSize: '11.5px',
                color: 'var(--error-color)',
                marginBottom: '12px'
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{config.stopReason}</span>
            </div>
          )}



          {/* Controls: Update Limit & Disable / Re-enable */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenModal}
              disabled={submitting}
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, minWidth: '120px', gap: '6px', justifyContent: 'center' }}
            >
              <Sliders size={13} />
              <span>Update Limit</span>
            </button>

            {isProxyActive ? (
              <button
                type="button"
                onClick={handleDisableProxy}
                disabled={submitting}
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, minWidth: '120px', gap: '6px', justifyContent: 'center', color: 'var(--error-color)' }}
              >
                <PowerOff size={13} />
                <span>Disable Proxy</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenModal}
                disabled={submitting}
                className="btn btn-burgundy btn-sm"
                style={{ flex: 1, minWidth: '120px', gap: '6px', justifyContent: 'center' }}
              >
                <RefreshCw size={13} />
                <span>Re-activate Proxy</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── State 2: Default Unconfigured Button ── */
        <button
          type="button"
          onClick={handleOpenModal}
          disabled={!isAuctionActive}
          className="btn btn-secondary"
          style={{
            width: '100%',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.03em',
            border: '1.5px dashed var(--accent-burgundy)',
            color: 'var(--accent-burgundy)',
            backgroundColor: 'rgba(120, 59, 75, 0.03)'
          }}
          id="enable-proxy-bidding-btn"
        >
          <Bot size={16} />
          <span>Enable Auto-bidding</span>
        </button>
      )}

      {/* ── Modal Dialog for Enabling / Updating Proxy Bidding ── */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="proxy-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            backgroundColor: 'rgba(25, 25, 25, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={handleCloseModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-xs)',
              boxShadow: '0 20px 48px rgba(0, 0, 0, 0.16)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg-primary)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={20} color="var(--accent-burgundy)" />
                <h3 id="proxy-modal-title" style={{ fontSize: '1.2rem', margin: 0 }}>
                  Auto-bidding
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveProxySettings} style={{ padding: '24px' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.5 }}>
                Authorize Veyra's authoritative bidding agent to automatically place incremental counter-bids on your behalf whenever competing bids are accepted.
              </p>

              {/* Auction Context summary */}
              <div
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '18px',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Current Highest Bid:</span>
                  <strong>{formatINR(currentBid)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Minimum Next Bid:</span>
                  <strong style={{ color: 'var(--accent-burgundy)' }}>{formatINR(minRequiredBid)}</strong>
                </div>
              </div>

              {/* Field 1: Maximum Bid Limit (₹) */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="proxy-max-bid"
                  style={{ fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}
                >
                  Maximum Bid Limit (₹) *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ₹
                  </span>
                  <input
                    id="proxy-max-bid"
                    type="number"
                    step={minIncrement}
                    min={minRequiredBid}
                    value={maxBidInput}
                    onChange={(e) => setMaxBidInput(e.target.value)}
                    placeholder={`e.g. ${minRequiredBid + minIncrement * 4}`}
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '28px',
                      paddingRight: '12px',
                      border: '1.5px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '14px',
                      fontWeight: 600,
                      outline: 'none',
                      color: 'var(--text-primary)'
                    }}
                    required
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  The highest total amount you authorize. The agent will never bid above this boundary.
                </span>
              </div>

              {/* Field 2: Preferred Bid Increment (₹) */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="proxy-increment"
                  style={{ fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}
                >
                  Preferred Bid Increment (₹) *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ₹
                  </span>
                  <input
                    id="proxy-increment"
                    type="number"
                    step={minIncrement}
                    min={minIncrement}
                    value={incrementInput}
                    onChange={(e) => setIncrementInput(e.target.value)}
                    placeholder={`Minimum ${minIncrement}`}
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '28px',
                      paddingRight: '12px',
                      border: '1.5px solid var(--border-color)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '14px',
                      fontWeight: 600,
                      outline: 'none',
                      color: 'var(--text-primary)'
                    }}
                    required
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Step amount for counter-bids (must be at least the auction minimum of {formatINR(minIncrement)}).
                </span>
              </div>

              {/* Error Alert */}
              {formError && (
                <div
                  style={{
                    backgroundColor: 'rgba(158, 58, 58, 0.08)',
                    border: '1px solid rgba(158, 58, 58, 0.25)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--error-color)',
                    fontSize: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Rules statement */}
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.45 }}>
                <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                The backend independently enforces minimum increments, maximum boundaries, and self-outbid protection on every transaction.
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary"
                  style={{ height: '42px', padding: '0 18px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-burgundy"
                  style={{ height: '42px', padding: '0 24px', fontSize: '13px', fontWeight: 600 }}
                  id="confirm-enable-proxy-btn"
                >
                  {submitting
                    ? 'Activating...'
                    : config?.status === 'active'
                    ? 'Update Settings'
                    : 'Enable Auto-bidding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
