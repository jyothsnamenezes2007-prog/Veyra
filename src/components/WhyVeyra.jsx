import React from 'react';
import { Compass, Hammer, Sparkles, Store } from 'lucide-react';

export const WhyVeyra = () => {
  const pillars = [
    {
      number: '01',
      icon: Compass,
      title: 'Discover distinctive products',
      description:
        'Every object on Veyra is vetted for authentic craftsmanship, design permanence, and material integrity. Uncover pieces you will not find anywhere else.'
    },
    {
      number: '02',
      icon: Hammer,
      title: 'Participate in exciting auctions',
      description:
        'Experience the thrill of real-time bidding on rare vintage masterworks, studio prototypes, and single-edition releases with transparent provenance.'
    },
    {
      number: '03',
      icon: Store,
      title: 'Shop from independent sellers',
      description:
        'Support authentic artisans, master ceramists, and independent archive curators directly. Fair atelier compensation and museum-grade shipping.'
    }
  ];

  return (
    <section
      style={{
        borderTop: '1px solid var(--border-color)',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: '#FFFFFF',
        padding: 'clamp(56px, 7vw, 96px) 0'
      }}
    >
      <div className="container">
        {/* Header */}
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px' }}>
          <span className="eyebrow">The Veyra Standard</span>
          <h2 style={{ fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', marginBottom: '14px' }}>
            Why Veyra?
          </h2>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)' }}>
            An interactive auction and bidding marketplace connecting collectors with independent sellers through extraordinary objects, live auctions, and real-time bidding.
          </p>
        </div>

        {/* 3 Columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'clamp(32px, 5vw, 48px)'
          }}
        >
          {pillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '28px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-color)',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px'
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--surface-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-burgundy)'
                    }}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '1.4rem',
                      color: 'var(--accent-burgundy)',
                      fontWeight: 600,
                      opacity: 0.5
                    }}
                  >
                    {item.number}
                  </span>
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.4rem',
                    fontWeight: 500,
                    marginBottom: '10px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.25
                  }}
                >
                  {item.title}
                </h3>

                <p
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    margin: 0
                  }}
                >
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
