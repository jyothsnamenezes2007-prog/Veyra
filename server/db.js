import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS } from '../src/data/products.js';
import { INITIAL_LIVE_AUCTIONS, UPCOMING_AUCTIONS } from '../src/data/auctions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let dbCache = null;
let saveQueue = Promise.resolve();

export function initDatabase() {
  if (dbCache) return dbCache;

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      dbCache = JSON.parse(raw);
      if (!Array.isArray(dbCache.proxyConfigs)) {
        dbCache.proxyConfigs = [];
      }
      if (!Array.isArray(dbCache.payments)) {
        dbCache.payments = [];
      }
      if (!dbCache.comments || typeof dbCache.comments !== 'object') {
        dbCache.comments = {};
      }
      if (!dbCache.comments['auc-1'] || dbCache.comments['auc-1'].length === 0) {
        const cNow = Date.now();
        dbCache.comments['auc-1'] = [
          { id: 'c-1', user: 'ArchivalCurator', message: 'Incredible condition on the woven cane seating.', timestamp: cNow - 720000 },
          { id: 'c-2', user: 'Veyra Specialist', message: 'Stenciled inventory marks authenticated against Chandigarh archives.', timestamp: cNow - 480000 },
          { id: 'c-3', user: 'A. Singhania', message: 'Bid entered. Exceptional provenance.', timestamp: cNow - 180000 }
        ];
      }
      if (Array.isArray(dbCache.auctions)) {
        for (const auc of dbCache.auctions) {
          if (typeof auc.startingBid !== 'number' || isNaN(auc.startingBid)) {
            auc.startingBid = Number(auc.startingBid) || 0;
          }
          if (typeof auc.currentBid !== 'number' || isNaN(auc.currentBid)) {
            auc.currentBid = auc.startingBid;
          }
          if (typeof auc.minIncrement !== 'number' || isNaN(auc.minIncrement) || auc.minIncrement <= 0) {
            auc.minIncrement = Math.max(500, Math.round(((auc.startingBid || 0) * 0.05) / 500) * 500);
          }
          if (typeof auc.bidCount !== 'number' || isNaN(auc.bidCount)) {
            auc.bidCount = Array.isArray(auc.bidHistory) ? auc.bidHistory.length : 0;
          }
          if (!Array.isArray(auc.bidHistory)) {
            auc.bidHistory = [];
          }
        }
      }
      persistDatabaseSync();
      console.log(`[Veyra DB] Loaded database with ${dbCache.auctions?.length || 0} auctions, ${dbCache.products?.length || 0} products.`);
      return dbCache;
    } catch (err) {
      console.warn('[Veyra DB] Failed to parse db.json, re-initializing from defaults:', err);
    }
  }

  // Seed default data
  const now = Date.now();
  const seededProducts = PRODUCTS.map((p) => ({
    ...p,
    type: 'shop',
    isAuction: false,
    listingStatus: 'active',
    listedAt: p.listedAt || new Date().toISOString()
  }));

  const seededAuctions = [
    ...INITIAL_LIVE_AUCTIONS.map((a) => {
      const start = a.startTimestamp || now - 60000;
      const end = a.endTimestamp || now + (a.endsInSeconds || 3600) * 1000;
      return {
        ...a,
        type: 'auction',
        isAuction: true,
        approvalStatus: 'approved',
        status: now < start ? 'scheduled' : now < end ? 'active' : 'ended',
        startTimestamp: start,
        scheduledTimestamp: start,
        endTimestamp: end,
        endTime: end,
        remainingSeconds: Math.max(0, Math.floor((end - now) / 1000)),
        winner: a.winner || null,
        bidHistory: a.bidHistory || []
      };
    }),
    ...UPCOMING_AUCTIONS.map((u) => {
      const start = u.scheduledTimestamp || now + 86400000;
      const end = start + 3 * 86400000;
      return {
        ...u,
        type: 'auction',
        isAuction: true,
        approvalStatus: 'approved',
        status: 'scheduled',
        startTimestamp: start,
        scheduledTimestamp: start,
        endTimestamp: end,
        endTime: end,
        remainingSeconds: Math.max(0, Math.floor((start - now) / 1000)),
        currentBid: u.currentBid || u.startingBid,
        minIncrement: u.minIncrement || Math.max(500, Math.round(((u.startingBid || 0) * 0.05) / 500) * 500),
        bidCount: u.bidCount || 0,
        winner: null,
        bidHistory: []
      };
    })
  ];

  dbCache = {
    products: seededProducts,
    auctions: seededAuctions,
    reminders: ['up-2'],
    registrations: ['up-1'],
    proxyConfigs: [],
    payments: [],
    comments: {
      'auc-1': [
        { id: 'c-1', user: 'ArchivalCurator', message: 'Incredible condition on the woven cane seating.', timestamp: now - 720000 },
        { id: 'c-2', user: 'Veyra Specialist', message: 'Stenciled inventory marks authenticated against Chandigarh archives.', timestamp: now - 480000 },
        { id: 'c-3', user: 'A. Singhania', message: 'Bid entered. Exceptional provenance.', timestamp: now - 180000 }
      ]
    }
  };

  persistDatabaseSync();
  console.log('[Veyra DB] Initialized and seeded fresh db.json.');
  return dbCache;
}

function persistDatabaseSync() {
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(dbCache, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function saveDatabase() {
  saveQueue = saveQueue.then(async () => {
    try {
      const json = JSON.stringify(dbCache, null, 2);
      try {
        const tmpPath = `${DB_PATH}.tmp`;
        await fs.promises.writeFile(tmpPath, json, 'utf8');
        await fs.promises.rename(tmpPath, DB_PATH);
      } catch (renameErr) {
        // Fallback for Windows file-locking EPERM
        await fs.promises.writeFile(DB_PATH, json, 'utf8');
      }
    } catch (err) {
      console.error('[Veyra DB] Error persisting database to disk:', err);
    }
  });
  return saveQueue;
}

// Development-only isolated test auction store (in-memory only, strictly excluded from production and never saved to db.json)
export const DEV_TEST_AUCTION_ID = 'auc-dev-test';

let devTestAuctionState = {
  id: DEV_TEST_AUCTION_ID,
  name: '[DEV TEST ONLY] Post-Auction Consultation Lot',
  seller: 'Veyra Artisan Atelier',
  sellerId: 'seller-atelier-1',
  type: 'auction',
  isAuction: true,
  status: 'ended',
  startingBid: 100,
  currentBid: 100,
  winningBid: 100,
  minIncrement: 50,
  bidCount: 1,
  paymentStatus: 'pending',
  isDevTest: true
};

let devTestPayments = [];

export function resetDevTestAuction() {
  devTestAuctionState = {
    id: DEV_TEST_AUCTION_ID,
    name: '[DEV TEST ONLY] Post-Auction Consultation Lot',
    seller: 'Veyra Artisan Atelier',
    sellerId: 'seller-atelier-1',
    type: 'auction',
    isAuction: true,
    status: 'ended',
    startingBid: 100,
    currentBid: 100,
    winningBid: 100,
    minIncrement: 50,
    bidCount: 1,
    paymentStatus: 'pending',
    isDevTest: true
  };
  devTestPayments = [];
}

export function getDatabase() {
  if (!dbCache) initDatabase();
  return dbCache;
}

// Auction operations
export function getAuctions() {
  const db = getDatabase();
  return db.auctions;
}

export function getAuctionById(id) {
  if (id === DEV_TEST_AUCTION_ID) {
    if (process.env.NODE_ENV === 'production') return null;
    return devTestAuctionState;
  }
  const db = getDatabase();
  return db.auctions.find((a) => a.id === id || a.productId === id);
}

export function insertAuction(auction) {
  const db = getDatabase();
  db.auctions.unshift(auction);
  saveDatabase();
  return auction;
}

export function updateAuction(id, updates) {
  if (id === DEV_TEST_AUCTION_ID) {
    if (process.env.NODE_ENV === 'production') return null;
    devTestAuctionState = { ...devTestAuctionState, ...updates };
    return devTestAuctionState;
  }
  const db = getDatabase();
  const index = db.auctions.findIndex((a) => a.id === id || a.productId === id);
  if (index === -1) return null;
  db.auctions[index] = { ...db.auctions[index], ...updates };
  saveDatabase();
  return db.auctions[index];
}

// Product operations
export function getProducts() {
  const db = getDatabase();
  return db.products;
}

export function getProductById(id) {
  const db = getDatabase();
  return db.products.find((p) => p.id === id || p.auctionId === id || p.upcomingId === id);
}

export function insertProduct(product) {
  const db = getDatabase();
  db.products.unshift(product);
  saveDatabase();
  return product;
}

export function updateProduct(id, updates) {
  const db = getDatabase();
  const index = db.products.findIndex((p) => p.id === id);
  if (index === -1) return null;
  db.products[index] = { ...db.products[index], ...updates };
  saveDatabase();
  return db.products[index];
}

export function deleteProduct(id) {
  const db = getDatabase();
  const index = db.products.findIndex((p) => p.id === id);
  if (index === -1) return false;
  const removed = db.products.splice(index, 1)[0];
  saveDatabase();
  return removed;
}

export function deleteCustomAuction(id) {
  // CRITICAL SAFETY CHECK: NEVER allow deletion of real production auctions
  if (id === 'auc-1' || id === 'up-2' || id === 'auc-dev-test') {
    return false;
  }
  const db = getDatabase();
  const index = db.auctions.findIndex((a) => a.id === id || a.productId === id);
  if (index === -1) return false;
  const removed = db.auctions.splice(index, 1)[0];
  saveDatabase();
  return removed;
}

// Proxy bidding operations
export function getProxyConfigs(auctionId = null) {
  const db = getDatabase();
  if (!Array.isArray(db.proxyConfigs)) {
    db.proxyConfigs = [];
  }
  if (auctionId) {
    return db.proxyConfigs.filter((pc) => pc.auctionId === auctionId);
  }
  return db.proxyConfigs;
}

export function getProxyConfigByUser(auctionId, userId) {
  const db = getDatabase();
  if (!Array.isArray(db.proxyConfigs)) {
    db.proxyConfigs = [];
  }
  return db.proxyConfigs.find((pc) => pc.auctionId === auctionId && pc.userId === userId) || null;
}

export function upsertProxyConfig(config) {
  const db = getDatabase();
  if (!Array.isArray(db.proxyConfigs)) {
    db.proxyConfigs = [];
  }
  const idx = db.proxyConfigs.findIndex(
    (pc) => pc.auctionId === config.auctionId && pc.userId === config.userId
  );
  const now = Date.now();
  if (idx >= 0) {
    db.proxyConfigs[idx] = {
      ...db.proxyConfigs[idx],
      ...config,
      updatedAt: now
    };
    saveDatabase();
    return db.proxyConfigs[idx];
  } else {
    const newConfig = {
      id: config.id || `pb-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
      ...config
    };
    db.proxyConfigs.push(newConfig);
    saveDatabase();
    return newConfig;
  }
}

export function updateProxyConfig(id, updates) {
  const db = getDatabase();
  if (!Array.isArray(db.proxyConfigs)) {
    db.proxyConfigs = [];
  }
  const idx = db.proxyConfigs.findIndex((pc) => pc.id === id);
  if (idx === -1) return null;
  db.proxyConfigs[idx] = {
    ...db.proxyConfigs[idx],
    ...updates,
    updatedAt: Date.now()
  };
  saveDatabase();
  return db.proxyConfigs[idx];
}

// Comment operations
export function getCommentsByAuction(auctionId) {
  if (!dbCache) initDatabase();
  return (dbCache.comments && dbCache.comments[auctionId]) || [];
}

export function insertComment(auctionId, comment) {
  if (!dbCache) initDatabase();
  if (!dbCache.comments) dbCache.comments = {};
  if (!Array.isArray(dbCache.comments[auctionId])) {
    dbCache.comments[auctionId] = [];
  }
  const existing = dbCache.comments[auctionId].find((c) => c.id === comment.id);
  if (existing) {
    return existing;
  }
  dbCache.comments[auctionId].push(comment);
  persistDatabaseSync();
  return comment;
}

// Payment operations
export function getPayments() {
  const db = getDatabase();
  return db.payments || [];
}

export function getPaymentById(id) {
  const db = getDatabase();
  return (db.payments || []).find((p) => p.id === id || p.orderId === id || p.paymentId === id);
}

export function getPaymentByAuctionId(auctionId) {
  if (auctionId === DEV_TEST_AUCTION_ID) {
    if (process.env.NODE_ENV === 'production') return null;
    return devTestPayments.find((p) => p.status === 'completed');
  }
  const db = getDatabase();
  return (db.payments || []).find((p) => p.auctionId === auctionId && p.status === 'completed');
}

export function insertPayment(payment) {
  if (payment.auctionId === DEV_TEST_AUCTION_ID || payment.isDevTest) {
    if (process.env.NODE_ENV === 'production') return null;
    const existingIdx = devTestPayments.findIndex(
      (p) => p.orderId === payment.orderId || (payment.id && p.id === payment.id)
    );
    if (existingIdx !== -1) {
      devTestPayments[existingIdx] = { ...devTestPayments[existingIdx], ...payment, isDevTest: true };
      return devTestPayments[existingIdx];
    }
    const record = { ...payment, isDevTest: true };
    devTestPayments.unshift(record);
    return record;
  }
  const db = getDatabase();
  if (!Array.isArray(db.payments)) {
    db.payments = [];
  }
  const existingIdx = db.payments.findIndex((p) => p.orderId === payment.orderId || (payment.id && p.id === payment.id));
  if (existingIdx !== -1) {
    db.payments[existingIdx] = { ...db.payments[existingIdx], ...payment };
    saveDatabase();
    return db.payments[existingIdx];
  }
  db.payments.unshift(payment);
  saveDatabase();
  return payment;
}

export function updatePayment(orderId, updates) {
  const devIdx = devTestPayments.findIndex((p) => p.orderId === orderId || p.paymentId === orderId || p.id === orderId);
  if (devIdx !== -1) {
    if (process.env.NODE_ENV === 'production') return null;
    devTestPayments[devIdx] = { ...devTestPayments[devIdx], ...updates, isDevTest: true };
    return devTestPayments[devIdx];
  }
  const db = getDatabase();
  if (!Array.isArray(db.payments)) {
    db.payments = [];
    return null;
  }
  const idx = db.payments.findIndex((p) => p.orderId === orderId || p.paymentId === orderId || p.id === orderId);
  if (idx === -1) return null;
  db.payments[idx] = { ...db.payments[idx], ...updates };
  saveDatabase();
  return db.payments[idx];
}
