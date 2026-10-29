import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Eye, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { formatINR } from '../data/products';

export const ProductCard = React.memo(({ product, onQuickView }) => {
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const isFavorited = isInWishlist(product.id);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  };

  return (
    <article
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-xs)',
        overflow: 'hidden'
      }}
      className="marketplace-product-card card-interactive"
    >
      {/* Product Image Frame */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          backgroundColor: 'var(--surface-secondary)',
          overflow: 'hidden'
        }}
      >
        <Link to={`/product/${product.id}`} style={{ display: 'block', width: '100%', height: '100%' }}>
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.35s ease, opacity 0.3s ease',
              transform: isHovered ? 'scale(1.03)' : 'scale(1)',
              opacity: imageLoaded ? 1 : 0
            }}
          />
        </Link>

        {/* Category Pill on Image */}
        <span
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            padding: '3px 7px',
            backgroundColor: 'rgba(248, 247, 244, 0.94)',
            backdropFilter: 'blur(4px)',
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-xs)',
            pointerEvents: 'none'
          }}
        >
          {product.category}
        </span>

        {/* Wishlist Heart Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product);
          }}
          aria-label={isFavorited ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isFavorited ? 'var(--accent-burgundy)' : 'var(--text-primary)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
            transition: 'transform 150ms ease',
            zIndex: 3,
            cursor: 'pointer'
          }}
          title={isFavorited ? 'Saved in Wishlist' : 'Add to Wishlist'}
        >
          <Heart size={15} fill={isFavorited ? 'currentColor' : 'none'} strokeWidth={1.75} />
        </button>

        {/* Quick View Button */}
        {onQuickView && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView(product);
            }}
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '4px 10px',
              backgroundColor: 'rgba(25, 25, 25, 0.85)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 180ms ease',
              cursor: 'pointer',
              border: 'none',
              zIndex: 3
            }}
          >
            <Eye size={12} />
            <span>Quick View</span>
          </button>
        )}
      </div>

      {/* Product Details & Purchasing Actions */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        <div>
          {/* Seller & Verification — clickable if seller has a sellerId */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
            {product.sellerId ? (
              <Link
                to={`/seller/${product.sellerId}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'color 150ms ease'
                }}
                className="hover-burgundy"
              >
                {product.seller}
              </Link>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {product.seller}
              </span>
            )}
            <CheckCircle2 size={12} color="var(--accent-burgundy)" />
          </div>

          {/* Title */}
          <Link to={`/product/${product.id}`}>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.18rem',
                fontWeight: 500,
                lineHeight: 1.25,
                color: 'var(--text-primary)',
                margin: '0 0 8px 0',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                minHeight: '2.5em'
              }}
              className="hover-burgundy"
              title={product.name}
            >
              {product.name}
            </h3>
          </Link>

          {/* Price & Delivery */}
          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '0.01em',
                lineHeight: 1
              }}
            >
              {formatINR(product.price)}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <span className="badge-shipping">
                Insured Delivery
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {product.condition || 'Studio Original'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleAddToCart}
          className={`btn ${justAdded ? 'btn-primary' : 'btn-secondary'}`}
          style={{
            width: '100%',
            height: '38px',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            gap: '6px'
          }}
        >
          {justAdded ? (
            <>
              <CheckCircle2 size={14} color="var(--success-color)" />
              <span>Added to Bag</span>
            </>
          ) : (
            <>
              <ShoppingBag size={14} />
              <span>Add to Bag</span>
            </>
          )}
        </button>
      </div>
    </article>
  );
});

ProductCard.displayName = 'ProductCard';

