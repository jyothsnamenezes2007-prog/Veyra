import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Hammer, Heart } from 'lucide-react';
import { formatINR } from '../data/products';
import { useWishlist } from '../context/WishlistContext';

export const AuctionCard = ({ auction, onOpenBidModal }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { isInWishlist, toggleWishlist } = useWishlist();

  const remaining = auction.remainingSeconds ?? 0;
  const isLive = remaining > 0;
  const isFav = isInWishlist(auction.productId || auction.id);
  const minNext = auction.currentBid + auction.minIncrement;

  const formatCountdown = (totalSeconds) => {
    if (totalSeconds <= 0) return 'Concluded';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  };

  return (
    <article
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-xs)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      className="marketplace-auction-card card-interactive"
    >
      {/* Visual Frame */}
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
            onLoad={() => setImageLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: imageLoaded ? 1 : 0.8,
              transition: 'opacity 0.3s ease, transform 0.3s ease'
            }}
            className="auction-img"
          />
        </Link>

        {/* Live Badge Indicator */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 2 }}>
          {auction.status === 'scheduled' || auction.status === 'upcoming' || (auction.startTimestamp && Date.now() < auction.startTimestamp && !isLive) ? (
            <span
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                backgroundColor: 'rgba(212, 163, 115, 0.95)',
                color: '#3B2314',
                letterSpacing: '0.05em',
                borderRadius: 'var(--radius-xs)',
                fontWeight: 700
              }}
            >
              SCHEDULED
            </span>
          ) : isLive ? (
            <span className="badge-live">
              <span className="dot" />
              ONGOING
            </span>
          ) : (
            <span
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                backgroundColor: 'rgba(25, 25, 25, 0.8)',
                color: '#FFF',
                letterSpacing: '0.05em',
                borderRadius: 'var(--radius-xs)',
                fontWeight: 600
              }}
            >
              CONCLUDED
            </span>
          )}
        </div>

        {/* Lot ID */}
        <span
          style={{
            position: 'absolute',
            top: '10px',
            right: '46px',
            padding: '2px 6px',
            backgroundColor: 'rgba(25, 25, 25, 0.8)',
            color: '#FFF',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            borderRadius: 'var(--radius-xs)',
            zIndex: 2
          }}
        >
          LOT #{auction.id.toUpperCase()}
        </span>

        {/* Watchlist Button */}
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
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
            zIndex: 3,
            cursor: 'pointer'
          }}
          title={isFav ? 'Saved in Watchlist' : 'Add to Watchlist'}
        >
          <Heart size={14} fill={isFav ? 'currentColor' : 'none'} strokeWidth={1.75} />
        </button>

        {/* Provenance Pill */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            backgroundColor: 'rgba(248, 247, 244, 0.92)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-xs)',
            fontSize: '10.5px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            backdropFilter: 'blur(4px)',
            maxWidth: 'calc(100% - 20px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {auction.provenance || auction.maker}
        </div>
      </div>

      {/* Auction Info */}
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
                marginBottom: '6px',
                color: 'var(--text-primary)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                minHeight: '2.5em'
              }}
              className="hover-burgundy"
              title={auction.name}
            >
              {auction.name}
            </h3>
          </Link>

          {/* Seller name — clickable to navigate to seller shop */}
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Atelier:{' '}
            {auction.sellerId ? (
              <Link
                to={`/seller/${auction.sellerId}`}
                className="hover-burgundy"
                style={{ color: 'var(--text-primary)', fontWeight: 600 }}
              >
                {auction.seller || auction.maker}
              </Link>
            ) : (
              <strong style={{ color: 'var(--text-primary)' }}>{auction.seller || auction.maker}</strong>
            )}
          </p>
        </div>

        {/* Bid Status & Timer */}
        <div>
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-color)',
              marginBottom: '12px',
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: '8px'
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  fontWeight: 600
                }}
              >
                Current Bid ({auction.bidCount} bids)
              </span>
              <span
                style={{
                  fontSize: 'var(--text-md)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {formatINR(auction.currentBid)}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--accent-burgundy)', display: 'block' }}>
                Next Min: {formatINR(minNext)}
              </span>
            </div>

            <div>
              <span
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  fontWeight: 600
                }}
              >
                Time Left
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: isLive ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                <Clock size={12} strokeWidth={2} />
                <span>{formatCountdown(remaining)}</span>
              </div>
            </div>
          </div>

          {/* Join Live Action Button */}
          <Link
            to={`/live/${auction.id}`}
            className={`btn ${isLive ? 'btn-burgundy' : 'btn-secondary'}`}
            style={{
              width: '100%',
              height: '38px',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              gap: '6px'
            }}
          >
            <Hammer size={14} />
            <span>{isLive ? 'Join Live & Bid' : 'Auction Concluded'}</span>
          </Link>
        </div>
      </div>
    </article>
  );
};
