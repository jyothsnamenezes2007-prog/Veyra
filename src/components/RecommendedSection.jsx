import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Calendar, ArrowRight, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import { formatINR } from '../data/products';

export const RecommendedSection = ({ liveAuctions = [], upcomingAuctions = [], onOpenBidModal }) => {
  const [activeTab, setActiveTab] = useState('ongoing'); // 'ongoing' | 'upcoming'

  const ongoingAuctions = liveAuctions.filter(
    (a) => (a.status === 'active' || (!a.status && (a.endsInSeconds || 0) > 0)) && (a.remainingSeconds ?? 1) > 0
  );

  const scheduledLots = upcomingAuctions.filter(
    (a) => a.status === 'scheduled' || a.status === 'upcoming' || !a.status
  );

  const displayedLots = activeTab === 'ongoing' ? ongoingAuctions : scheduledLots;

  return (
    <section
      style={{
        paddingTop: '64px',
        paddingBottom: '64px',
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid var(--border-color)',
        borderBottom: '1px solid var(--border-color)'
      }}
      aria-labelledby="recommended-heading"
    >
      <div className="container" style={{ maxWidth: '1280px' }}>
        {/* Section Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
            marginBottom: '32px'
          }}
        >
          <div>
            <span
              className="eyebrow"
              style={{
                margin: 0,
                marginBottom: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={12} color="var(--accent-burgundy)" />
              Curated for Discerning Collectors
            </span>
            <h2
              id="recommended-heading"
              style={{
                fontSize: 'clamp(1.8rem, 3.2vw, 2.4rem)',
                margin: 0,
                fontFamily: 'var(--font-serif)',
                color: 'var(--text-primary)'
              }}
            >
              Recommended for You
            </h2>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginTop: '6px',
                maxWidth: '640px',
                lineHeight: 1.6
              }}
            >
              Authoritative ongoing auctions accepting live bids and curated upcoming heritage lots verified by master artisans.
            </p>
          </div>

          {/* Category Toggle Tabs */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--bg-primary)',
              padding: '4px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-color)'
            }}
            role="tablist"
            aria-label="Recommendation Categories"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ongoing'}
              onClick={() => setActiveTab('ongoing')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: 'var(--radius-xs)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                backgroundColor: activeTab === 'ongoing' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'ongoing' ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'ongoing' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 150ms ease'
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#E53E3E'
                }}
              />
              <span>Ongoing Auctions</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: activeTab === 'ongoing' ? 'rgba(120,59,75,0.1)' : 'var(--surface-secondary)',
                  color: activeTab === 'ongoing' ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                }}
              >
                {ongoingAuctions.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'upcoming'}
              onClick={() => setActiveTab('upcoming')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: 'var(--radius-xs)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                backgroundColor: activeTab === 'upcoming' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'upcoming' ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'upcoming' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 150ms ease'
              }}
            >
              <Calendar size={13} />
              <span>Upcoming Lots</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: activeTab === 'upcoming' ? 'rgba(120,59,75,0.1)' : 'var(--surface-secondary)',
                  color: activeTab === 'upcoming' ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                }}
              >
                {scheduledLots.length}
              </span>
            </button>
          </div>
        </div>

        {/* Recommendations Content Grid */}
        {displayedLots.length === 0 ? (
          <div
            style={{
              padding: '64px 24px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-color)'
            }}
          >
            <Clock size={40} color="var(--text-secondary)" style={{ opacity: 0.35, marginBottom: '14px' }} />
            <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
              {activeTab === 'ongoing' ? 'No Ongoing Auctions Active' : 'No Scheduled Upcoming Lots'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '460px', margin: '0 auto 20px', lineHeight: 1.6 }}>
              {activeTab === 'ongoing'
                ? 'All live auction sessions have concluded. Explore scheduled upcoming lots or atelier catalogue pieces.'
                : 'Upcoming lots are currently being authenticated by our specialist curators.'}
            </p>
            <Link
              to={activeTab === 'ongoing' ? '/upcoming-lots' : '/live-auctions'}
              className="btn btn-burgundy"
              style={{ gap: '8px' }}
            >
              <span>{activeTab === 'ongoing' ? 'View Upcoming Lots' : 'View Live Auctions'}</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '24px'
            }}
          >
            {displayedLots.slice(0, 4).map((lot) => {
              const isOngoing = activeTab === 'ongoing';
              const priceLabel = isOngoing ? 'Current Bid' : 'Starting Price';
              const priceValue = isOngoing
                ? (lot.currentBid || lot.startingBid)
                : (lot.startingBid || lot.price || 50000);

              return (
                <article
                  key={lot.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 180ms ease, box-shadow 180ms ease'
                  }}
                  className="card-interactive"
                >
                  {/* Image Container */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16 / 11',
                      backgroundColor: 'var(--surface-secondary)',
                      overflow: 'hidden'
                    }}
                  >
                    <Link to={`/live/${lot.id}`} style={{ display: 'block', width: '100%', height: '100%' }}>
                      <img
                        src={lot.image}
                        alt={lot.name}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </Link>

                    {/* Status Badge */}
                    <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 2 }}>
                      {isOngoing ? (
                        <span className="badge-live">
                          <span className="dot" />
                          ONGOING
                        </span>
                      ) : (
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
                      )}
                    </div>

                    {/* Category Tag */}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        padding: '3px 8px',
                        backgroundColor: 'rgba(25, 25, 25, 0.8)',
                        color: '#FFF',
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        borderRadius: 'var(--radius-xs)',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      {lot.category || 'Curated Atelier'}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div
                    style={{
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={12} color="var(--accent-burgundy)" />
                        <span>{lot.maker || lot.seller || 'Artisan Workshop'}</span>
                      </div>

                      <h3
                        style={{
                          fontSize: '15px',
                          fontWeight: 600,
                          margin: 0,
                          marginBottom: '12px',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        <Link
                          to={`/live/${lot.id}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                          className="hover-burgundy"
                        >
                          {lot.name}
                        </Link>
                      </h3>
                    </div>

                    {/* Price & Action Row */}
                    <div>
                      <div
                        style={{
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '14px'
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              color: 'var(--text-secondary)',
                              display: 'block'
                            }}
                          >
                            {priceLabel}
                          </span>
                          <strong
                            style={{
                              fontSize: '16px',
                              color: isOngoing ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          >
                            {formatINR(priceValue)}
                          </strong>
                        </div>

                        {lot.bidCount !== undefined && isOngoing && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              fontWeight: 500
                            }}
                          >
                            {lot.bidCount} {lot.bidCount === 1 ? 'bid' : 'bids'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link
                          to={`/live/${lot.id}`}
                          className="btn btn-burgundy"
                          style={{
                            flex: 1,
                            height: '38px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <Gavel size={13} />
                          <span>{isOngoing ? 'Bid Live' : 'View Lot'}</span>
                        </Link>

                        {isOngoing && onOpenBidModal && (
                          <button
                            type="button"
                            onClick={() => onOpenBidModal(lot)}
                            className="btn btn-secondary"
                            style={{
                              height: '38px',
                              padding: '0 12px',
                              fontSize: '12px'
                            }}
                            title="Quick Bid"
                          >
                            Quick Bid
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* View All Bottom Bar */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <Link
            to={activeTab === 'ongoing' ? '/live-auctions' : '/upcoming-lots'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--accent-burgundy)',
              textDecoration: 'none'
            }}
            className="hover-underline"
          >
            <span>{activeTab === 'ongoing' ? 'Explore all active live auction lots' : 'Explore complete calendar of upcoming lots'}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
};
