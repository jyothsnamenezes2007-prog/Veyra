// VEYRA Curated Product Catalog
// Editorial artisan pieces, ceramics, handcrafted objects, and studio art

export const CATEGORIES = [
  { id: 'all', name: 'All Objects', description: 'Curated selection of all exceptional artisan creations.' },
  { id: 'art-prints', name: 'Art & Prints', count: 8, description: 'Archival monotypes, woodcut prints, and fine studio works on cotton rag.' },
  { id: 'handmade', name: 'Handmade Ceramics', count: 12, description: 'Wood-fired anagama ceramics, raku stoneware, and wheel-thrown porcelain.' },
  { id: 'home-living', name: 'Home & Living', count: 10, description: 'Sculptural bronze holders, hand-turned timber vessels, and botanical textiles.' },
  { id: 'fashion', name: 'Fashion & Accessories', count: 6, description: 'Hand-loomed wild peace silks, vegetable-tanned leather, and heirloom jewelry.' },
  { id: 'collectibles', name: 'Collectibles', count: 7, description: 'Carved volcanic basalt, chased sterling silver, and astrological instruments.' },
  { id: 'vintage', name: 'Vintage Finds', count: 5, description: 'Authenticated mid-century modern furniture, Bauhaus lighting, and design archives.' }
];

export const PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Ochre Raku Fluted Vessel',
    seller: 'Studio Vayu',
    sellerId: 'seller-vayu',
    location: 'Pondicherry, India',
    category: 'Handmade',
    price: 18500,
    rating: 4.9,
    condition: 'Pristine Studio Original',
    provenance: 'Handmade by Master Ceramists at Studio Vayu, 2024 Collection',
    authenticityCertificate: 'Signed by Artist with Studio Vayu Embossed Seal',
    image: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=1000&q=80',
    images: [
      'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1590736969955-71cc94801759?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Wheel-thrown stoneware vessel smoke-fired with local botanical leaves and natural ferric ochre slip. Each vessel possesses unique crazing and fire marks.',
    materials: 'High-fire stoneware, wood-ash glaze, natural mineral slip',
    dimensions: '24cm H × 18cm Ø',
    featured: true,
    inStock: true,
    availability: 'In Stock — Ready for white-glove delivery'
  },
  {
    id: 'prod-2',
    name: 'Cast Bronze Freeform Low Coffee Table',
    seller: 'Studio Alchemist, Jaipur',
    sellerId: 'seller-alchemist',
    location: 'Jaipur, Rajasthan',
    category: 'Home & Living',
    price: 120000,
    rating: 5.0,
    condition: 'New Studio Cast Specimen #01/05',
    provenance: 'Sand-cast in riverbed sand molds with hand-patinated verdigris finish in Jaipur.',
    authenticityCertificate: 'Studio Alchemist certificate and numbered foundry plaque',
    image: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80',
    images: [
      'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Molten bronze cast into riverbed sand molds with hand-patinated verdigris finish. Organic perimeter evocative of natural river stones.',
    materials: 'Architectural cast bronze, chemical verdigris patina',
    dimensions: '110cm L × 75cm W × 36cm H (approx 38kg)',
    featured: true,
    inStock: true,
    availability: 'Studio Direct — Ready for delivery'
  }
];

export const MAX_DEMO_PRODUCTS = 2;

/**
 * Validates whether a product has a valid, non-placeholder display image.
 * Image-less products must not appear in the public marketplace.
 */
export function hasValidImage(product) {
  if (!product) return false;
  const img = product.image;
  if (typeof img === 'string' && img.trim().length > 0 && !img.includes('placeholder')) {
    return true;
  }
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images.some(
      (i) => typeof i === 'string' && i.trim().length > 0 && !i.includes('placeholder')
    );
  }
  return false;
}

/**
 * Checks whether an item is a demo/sample product.
 */
export function isDemoProduct(product) {
  if (!product || !product.id) return false;
  return product.id === 'prod-1' || product.id === 'prod-2';
}

export const formatINR = (amount) => {
  const numeric = Number(amount);
  if (isNaN(numeric)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(numeric);
};
