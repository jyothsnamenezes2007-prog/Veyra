import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Sparkles, Hammer } from 'lucide-react';
import { CATEGORIES } from '../data/products';

export const Categories = () => {
  // Maps category IDs to the exact auction category names used in the auction data
  const categoryNameMap = {
    'art-prints': 'Art & Prints',
    'handmade': 'Handmade',
    'home-living': 'Home & Living',
    'fashion': 'Fashion & Accessories',
    'collectibles': 'Collectibles',
    'vintage': 'Vintage Finds'
  };
  const categoryShowcase = [
    {
      id: 'art-prints',
      name: 'Art & Prints',
      eyebrow: 'Edition Works & Archival Paper',
      description: 'Singular monotypes hand-pulled onto St Cuthbert cotton rag, Japanese reduction linocuts, and limited-edition stone lithographs.',
      count: '8 Catalog Lots',
      image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
      highlights: ['Monotypes', 'Reduction Linocuts', 'Fine Cotton Rag Prints']
    },
    {
      id: 'handmade',
      name: 'Handmade Ceramics',
      eyebrow: 'High-Fire Stoneware & Vessels',
      description: 'Anagama wood-fired vessels, smoke-fired raku jars with botanical slips, and Shigaraki kyusu teapots crafted by master ceramists.',
      count: '12 Catalog Lots',
      image: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=800&q=80',
      highlights: ['Wood-Fired Anagama', 'Raku Ferric Ochre', 'Kyusu Teaware']
    },
    {
      id: 'home-living',
      name: 'Home & Living',
      eyebrow: 'Architectural Objects & Tableware',
      description: 'Sand-cast solid architectural bronze candlesticks, lathe-turned Danish walnut catchalls, and natural indigo dyed linen textiles.',
      count: '10 Catalog Lots',
      image: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=800&q=80',
      highlights: ['Cast Bronze', 'Turned Walnut', 'Organic Linen']
    },
    {
      id: 'fashion',
      name: 'Fashion & Accessories',
      eyebrow: 'Hand-Loomed Textiles & Heirloom Leather',
      description: 'Wild Indian muga peace silks woven on pit-looms, vegetable-tanned bridle leather totes with hand-peened copper rivets.',
      count: '6 Catalog Lots',
      image: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?auto=format&fit=crop&w=800&q=80',
      highlights: ['Wild Muga Peace Silk', 'Bridle Leather', 'Natural Pit-Looms']
    },
    {
      id: 'collectibles',
      name: 'Collectibles',
      eyebrow: 'Stone Sculptures & Historical Artifacts',
      description: 'Volcanic basalt contemplation basins from Nagano, chased sterling silver ewers from Thanjavur, and 19th-century celestial astrolabes.',
      count: '7 Catalog Lots',
      image: 'https://images.unsplash.com/photo-1590736969955-71cc94801759?auto=format&fit=crop&w=800&q=80',
      highlights: ['Volcanic Basalt', '925 Sterling Repoussé', 'Brass Astrolabes']
    },
    {
      id: 'vintage',
      name: 'Vintage Finds',
      eyebrow: 'Mid-Century Modern & Archival Design',
      description: 'Authenticated Pierre Jeanneret Chandigarh teak armchairs, 1950s Bauhaus counterbalanced task lamps, and Danish rosewood credenzas.',
      count: '5 Catalog Lots',
      image: 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=800&q=80',
      highlights: ['Pierre Jeanneret 1956', 'Bauhaus Lighting', 'Scandinavian Modernism']
    }
  ];

  return (
    <div style={{ paddingTop: '40px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container">
        {/* Header */}
        <div style={{ maxWidth: '720px', marginBottom: '48px' }}>
          <span className="eyebrow">Collecting Disciplines</span>
          <h1 style={{ fontSize: 'clamp(2.4rem, 4.2vw, 3.4rem)', marginBottom: '12px' }}>
            All Curated Categories
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Explore Veyra across specialized disciplines of craft, archival design, fine paper prints, and living sculpture. Every object is verified for authenticity and maker provenance.
          </p>
        </div>

        {/* Categories Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '36px'
          }}
        >
          {categoryShowcase.map((cat) => (
            <div
              key={cat.id}
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
              {/* Visual Banner */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16 / 10',
                  backgroundColor: 'var(--surface-secondary)',
                  overflow: 'hidden'
                }}
              >
                <Link to={`/shop?category=${cat.id}`} style={{ display: 'block', width: '100%', height: '100%' }}>
                  <img
                    src={cat.image}
                    alt={cat.name}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Link>

                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '3px 8px',
                    backgroundColor: 'rgba(25, 25, 25, 0.82)',
                    color: '#FFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-xs)'
                  }}
                >
                  {cat.count}
                </div>
              </div>

              {/* Text Description & Exploration */}
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-burgundy)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    {cat.eyebrow}
                  </span>

                  <Link to={`/shop?category=${cat.id}`}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '1.6rem',
                        fontWeight: 500,
                        marginBottom: '8px',
                        color: 'var(--text-primary)'
                      }}
                      className="hover-burgundy"
                    >
                      {cat.name}
                    </h3>
                  </Link>

                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
                    {cat.description}
                  </p>

                  {/* Highlights */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {cat.highlights.map((hl) => (
                      <span
                        key={hl}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          backgroundColor: 'var(--bg-primary)',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {hl}
                      </span>
                    ))}
                  </div>
                </div>

                <Link
                  to={`/live-auctions?category=${encodeURIComponent(categoryNameMap[cat.id] || cat.name)}`}
                  className="btn btn-burgundy"
                  style={{ width: '100%', justifyContent: 'space-between', height: '40px', fontSize: '13px', marginBottom: '10px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Hammer size={14} />
                    <span>Explore Auctions</span>
                  </span>
                  <ArrowRight size={14} />
                </Link>

                <Link
                  to={`/shop?category=${cat.id}`}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'space-between', height: '40px', fontSize: '13px' }}
                >
                  <span>Explore {cat.name}</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
