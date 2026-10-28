// VEYRA Live & Upcoming Curated Auctions

export const DEMO_AUCTION_IDS = ['auc-1', 'auc-2', 'auc-3', 'auc-4'];

export const INITIAL_LIVE_AUCTIONS = [
  {
    id: 'auc-1',
    productId: 'prod-auc-1',
    name: 'Archival Chandigarh Teak & Cane V-Leg Chair (c. 1956)',
    maker: 'Pierre Jeanneret Workshop',
    seller: 'Pierre Jeanneret Workshop',
    sellerId: 'seller-jeanneret',
    provenance: 'Punjab Administrative Quarters, Chandigarh, 1956',
    category: 'Vintage Finds',
    currentBid: 96000,
    startingBid: 65000,
    minIncrement: 2500,
    bidCount: 16,
    endsInSeconds: 9900, // ~2h 45m
    status: 'active',
    image: 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80',
    images: [
      'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Original solid Burma teak framework with renewed natural hand-woven cane seating. Features documented stenciled archival inventory numbering on the rear apron.',
    dimensions: '78cm H × 51cm W × 54cm D',
    condition: 'Museum restored; authentic minor surface patina consistent with age.',
    authenticityCertificate: 'Certificate of Archival Authenticity by European Design Council',
    bidHistory: [
      { id: 'b-1', bidder: 'A. Singhania', amount: 96000, time: '3 mins ago', timestamp: Date.now() - 180000 },
      { id: 'b-2', bidder: 'Collector_90', amount: 93500, time: '14 mins ago', timestamp: Date.now() - 840000 },
      { id: 'b-3', bidder: 'Studio K.O.', amount: 90000, time: '38 mins ago', timestamp: Date.now() - 2280000 },
      { id: 'b-4', bidder: 'V. Mehta', amount: 85000, time: '1 hour ago', timestamp: Date.now() - 3600000 }
    ]
  },
  {
    id: 'auc-2',
    productId: 'prod-auc-2',
    name: 'Monolithic Carved Basalt Contemplation Basin',
    maker: 'Atelier Kuroda',
    seller: 'Atelier Kuroda',
    sellerId: 'seller-kuroda',
    provenance: 'Nagano Prefecture, Japan, 2023',
    category: 'Collectibles',
    currentBid: 68500,
    startingBid: 45000,
    minIncrement: 2000,
    bidCount: 11,
    endsInSeconds: 15420, // ~4h 17m
    status: 'active',
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80',
    images: [
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1590736969955-71cc94801759?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Sculpted from a single volcanic basalt boulder. The interior is hand-ground to a mirror sheen while preserving raw mineral fissures across the outer perimeter.',
    dimensions: '38cm Ø × 16cm H (approx 22kg)',
    condition: 'Pristine studio masterwork, signed by stone sculptor.',
    authenticityCertificate: 'Carved signature and seal by Master Kuroda',
    bidHistory: [
      { id: 'b-1', bidder: 'Elena R.', amount: 68500, time: '8 mins ago', timestamp: Date.now() - 480000 },
      { id: 'b-2', bidder: 'Marcus T.', amount: 66000, time: '22 mins ago', timestamp: Date.now() - 1320000 },
      { id: 'b-3', bidder: 'T. Nambiar', amount: 62000, time: '1 hour ago', timestamp: Date.now() - 3600000 }
    ]
  },
  {
    id: 'auc-3',
    productId: 'prod-auc-3',
    name: 'Repoussé Sterling Silver Water Ewer & Basin Set',
    maker: 'Master Craftsman H. Raman',
    seller: 'Master Craftsman H. Raman',
    sellerId: 'seller-raman',
    provenance: 'Thanjavur, Tamil Nadu',
    category: 'Collectibles',
    currentBid: 112000,
    startingBid: 80000,
    minIncrement: 3000,
    bidCount: 22,
    endsInSeconds: 4320, // ~1h 12m
    status: 'active',
    image: 'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=1000&q=80',
    images: [
      'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1590736969955-71cc94801759?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Forged from 925 sterling silver using traditional south Indian chased repoussé motifs depicting stylized temple lotus petals and flowing water rhythms.',
    dimensions: 'Ewer 32cm H; Basin 36cm Ø (Total weight: 1,420g)',
    condition: 'Excellent preservation, hallmarks authenticated.',
    authenticityCertificate: '925 Sterling Silver Government Hallmark & Guild Certification',
    bidHistory: [
      { id: 'b-1', bidder: 'Heritage Fund', amount: 112000, time: '1 min ago', timestamp: Date.now() - 60000 },
      { id: 'b-2', bidder: 'S. Kirloskar', amount: 108000, time: '7 mins ago', timestamp: Date.now() - 420000 },
      { id: 'b-3', bidder: 'Collector_90', amount: 104000, time: '25 mins ago', timestamp: Date.now() - 1500000 }
    ]
  },
  {
    id: 'auc-4',
    productId: 'prod-auc-4',
    name: 'Precision Chased Brass Astronomical Astrolabe (c. 1890)',
    maker: 'Royal Instrument Guild',
    seller: 'Royal Instrument Guild',
    sellerId: 'seller-guild',
    provenance: 'Private Observatory Collection, Jaipur',
    category: 'Collectibles',
    currentBid: 58000,
    startingBid: 42000,
    minIncrement: 2000,
    bidCount: 15,
    endsInSeconds: 7540, // ~2h 05m
    status: 'active',
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1000&q=80',
    images: [
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1590736969955-71cc94801759?auto=format&fit=crop&w=1000&q=80'
    ],
    description: 'Brass astrolabe quadrant featuring intricately cut rete showing major northern constellations, hand-stamped altitude circles, and original suspension ring.',
    dimensions: '21cm Ø × 1.2cm thick (Weight: 890g)',
    condition: 'Intact historical mechanism with warm antique brass patina.',
    authenticityCertificate: 'Heritage Instrument Guild Certificate of Antiquity',
    bidHistory: [
      { id: 'b-1', bidder: 'Aditi V.', amount: 58000, time: '5 mins ago', timestamp: Date.now() - 300000 },
      { id: 'b-2', bidder: 'S. Banerjee', amount: 56000, time: '19 mins ago', timestamp: Date.now() - 1140000 },
      { id: 'b-3', bidder: 'VintageCurator', amount: 52000, time: '42 mins ago', timestamp: Date.now() - 2520000 }
    ]
  }
];

export const UPCOMING_AUCTIONS = [
  {
    id: 'up-1',
    productId: 'prod-up-1',
    name: '1970s Danish Rosewood Articulated Credenza',
    maker: 'Ib Kofod-Larsen for Faarup Møbelfabrik',
    seller: 'Ib Kofod-Larsen for Faarup Møbelfabrik',
    sellerId: 'seller-faarup',
    scheduledDate: 'Thu, Oct 23 • 6:00 PM IST',
    scheduledTimestamp: Date.now() + 2 * 86400000, // 2 days in future
    startingBid: 145000,
    currentBid: 145000,
    minIncrement: 7500,
    bidCount: 0,
    bidHistory: [],
    category: 'Vintage Finds',
    thumbnail: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=600&q=80',
    curatorNote: 'Preserved Brazilian rosewood grain with tambour roll doors and solid brass pulls.',
    description: 'Preserved Brazilian rosewood grain with tambour roll doors and solid brass pulls. A seminal piece of Scandinavian modernism.'
  },
  {
    id: 'up-2',
    productId: 'prod-up-2',
    name: 'Large-scale Raku Pit-Fired Torso Sculpture',
    maker: 'Kavita Ghosh Ceramics',
    seller: 'Kavita Ghosh Ceramics',
    sellerId: 'seller-ghosh',
    scheduledDate: 'Sat, Oct 25 • 4:30 PM IST',
    scheduledTimestamp: Date.now() + 4 * 86400000, // 4 days in future
    startingBid: 52000,
    currentBid: 52000,
    minIncrement: 2500,
    bidCount: 0,
    bidHistory: [],
    category: 'Art & Prints',
    thumbnail: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=600&q=80',
    curatorNote: 'Single-edition stoneware smoked in sawdust and dried copper carbonates.',
    description: 'Single-edition stoneware smoked in sawdust and dried copper carbonates. Captures ethereal mineral iridescence.'
  },
  {
    id: 'up-3',
    productId: 'prod-up-3',
    name: 'Antique Tibetan Silver-Inlaid Ghau Amulet Box',
    maker: 'Himalayan Silversmith Guild (c. 1910)',
    seller: 'Himalayan Silversmith Guild (c. 1910)',
    sellerId: 'seller-himalaya',
    scheduledDate: 'Mon, Oct 27 • 8:00 PM IST',
    scheduledTimestamp: Date.now() + 6 * 86400000,
    startingBid: 78000,
    currentBid: 78000,
    minIncrement: 4000,
    bidCount: 0,
    bidHistory: [],
    category: 'Collectibles',
    thumbnail: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80',
    curatorNote: 'Natural turquoise, coral inlays, and filigree Buddhist auspicious emblems.',
    description: 'Natural turquoise, coral inlays, and filigree Buddhist auspicious emblems. Hand-forged silver body with copper backplate.'
  },
  {
    id: 'up-4',
    productId: 'prod-up-4',
    name: 'Cast Bronze Freeform Low Coffee Table',
    maker: 'Studio Alchemist, Jaipur',
    seller: 'Studio Alchemist, Jaipur',
    sellerId: 'seller-alchemist',
    scheduledDate: 'Wed, Oct 29 • 5:00 PM IST',
    scheduledTimestamp: Date.now() + 8 * 86400000,
    startingBid: 120000,
    currentBid: 120000,
    minIncrement: 6000,
    bidCount: 0,
    bidHistory: [],
    category: 'Home & Living',
    thumbnail: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80',
    curatorNote: 'Molten bronze cast into riverbed sand molds with hand-patinated verdigris finish.',
    description: 'Molten bronze cast into riverbed sand molds with hand-patinated verdigris finish. Organic perimeter evocative of natural river stones.'
  }
];

// Baseline snapshot of demo auctions used for presentation resets
export const INITIAL_LIVE_AUCTIONS_BASELINE = JSON.parse(JSON.stringify(INITIAL_LIVE_AUCTIONS));

export const getDemoBaselineAuction = (auctionId) => {
  const item = INITIAL_LIVE_AUCTIONS.find((a) => a.id === auctionId);
  return item ? JSON.parse(JSON.stringify(item)) : null;
};

/**
 * Authoritative Winner Calculation:
 * - Must be an ended auction
 * - Cancelled auctions have NO winner
 * - Validates bids in bidHistory
 * - Seller CANNOT be the winner
 * - Highest bid amount wins; earlier timestamp breaks ties
 */
export const getAuthoritativeAuctionWinner = (auction) => {
  if (!auction) return null;

  // 1. Cancelled auctions have no winner
  if (auction.status === 'cancelled' || auction.isCancelled) {
    return null;
  }

  // 2. Auction must be ended (by status or elapsed time)
  const now = Date.now();
  const end = auction.endTimestamp || auction.endTime || 0;
  const isEnded = auction.status === 'ended' || (end > 0 && now >= end);
  if (!isEnded) {
    return null;
  }

  // 3. Must have bids
  const bids = auction.bidHistory;
  if (!Array.isArray(bids) || bids.length === 0) {
    return null;
  }

  // 4. Seller cannot win their own auction
  const sellerId = auction.sellerId;
  const sellerName = (auction.seller || auction.maker || '').toLowerCase().trim();

  const validBids = bids.filter((b) => {
    if (!b || typeof b.amount !== 'number' || b.amount <= 0) return false;
    if (sellerId && b.bidderId && b.bidderId === sellerId) return false;
    if (sellerName && b.bidder && b.bidder.toLowerCase().trim() === sellerName) return false;
    return true;
  });

  if (validBids.length === 0) {
    return null;
  }

  // 5. Highest bid wins; earlier timestamp breaks ties
  const sorted = [...validBids].sort((a, b) => {
    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    return timeA - timeB;
  });

  const top = sorted[0];
  return {
    bidder: top.bidder,
    bidderId: top.bidderId || null,
    amount: top.amount,
    timestamp: top.timestamp || null,
    time: top.time || 'Hammer Winner'
  };
};

/**
 * Determine meeting access rights and button label for the authenticated user.
 */
export const getMeetingAccess = (auction, currentUser) => {
  if (!auction) {
    return { canAccessMeeting: false, buttonLabel: null, reason: 'No auction provided.' };
  }

  if (auction.status === 'cancelled' || auction.isCancelled) {
    return { canAccessMeeting: false, buttonLabel: null, reason: 'Auction was cancelled.' };
  }

  const now = Date.now();
  const end = auction.endTimestamp || auction.endTime || 0;
  const isEnded = auction.status === 'ended' || (end > 0 && now >= end);

  if (!isEnded) {
    return { canAccessMeeting: false, buttonLabel: null, reason: 'Auction is currently active.' };
  }

  const winner = getAuthoritativeAuctionWinner(auction);
  if (!winner) {
    return { canAccessMeeting: false, buttonLabel: null, reason: 'Auction concluded with no winning bids.' };
  }

  if (!currentUser) {
    return {
      canAccessMeeting: false,
      buttonLabel: null,
      winner,
      reason: 'Sign in to access post-auction consultation.'
    };
  }

  const sellerName = (auction.seller || auction.maker || '').toLowerCase().trim();
  const isSeller = Boolean(
    (auction.sellerId && currentUser.id === auction.sellerId) ||
    (sellerName && currentUser.name && currentUser.name.toLowerCase().trim() === sellerName) ||
    (sellerName && currentUser.studio && currentUser.studio.toLowerCase().trim() === sellerName) ||
    (currentUser.role === 'artisan' || currentUser.role === 'seller'
      ? (currentUser.id === auction.sellerId || (currentUser.name && sellerName && sellerName.includes(currentUser.name.toLowerCase().trim())))
      : false)
  );

  const winnerName = (winner.bidder || '').toLowerCase().trim();
  const currentUserName = (currentUser.name || '').toLowerCase().trim();
  const currentUserEmail = (currentUser.email || '').toLowerCase().trim();
  const currentUserUsername = (currentUser.username || '').toLowerCase().trim();
  const winnerTokens = winnerName.split(/[\s._-]+/).filter(Boolean);
  const userTokens = currentUserName.split(/[\s._-]+/).filter(Boolean);
  const tokenMatch = winnerTokens.some((t) => t.length > 2 && userTokens.includes(t));

  const isWinningBuyer = Boolean(
    !isSeller && (
      (winner.bidderId && currentUser.id === winner.bidderId) ||
      (winnerName && currentUserName && (
        currentUserName === winnerName ||
        winnerName.includes(currentUserName) ||
        currentUserName.includes(winnerName) ||
        tokenMatch
      )) ||
      (winnerName && currentUserUsername && (
        currentUserUsername === winnerName ||
        winnerName.includes(currentUserUsername)
      )) ||
      (winnerName && currentUserEmail && (
        currentUserEmail.split('@')[0] === winnerName
      )) ||
      winnerName === 'you' ||
      currentUser.role === 'admin'
    )
  );

  if (isWinningBuyer) {
    return {
      canAccessMeeting: true,
      userMeetingRole: 'buyer',
      isWinningBuyer: true,
      isSeller: false,
      winner,
      buttonLabel: 'Enter Meeting'
    };
  }

  if (isSeller) {
    return {
      canAccessMeeting: true,
      userMeetingRole: 'seller',
      isWinningBuyer: false,
      isSeller: true,
      winner,
      buttonLabel: 'Meet Winner'
    };
  }

  return {
    canAccessMeeting: false,
    userMeetingRole: null,
    isWinningBuyer: false,
    isSeller: false,
    winner,
    buttonLabel: null,
    reason: 'Meeting is restricted to the verified winning buyer and authenticated seller.'
  };
};
