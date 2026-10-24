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

export function seedDemoData() {
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
        winner: null,
        bidHistory: []
      };
    })
  ];

  return {
    products: seededProducts,
    auctions: seededAuctions,
    autoBids: [],
    messages: [],
    reminders: ['up-2'],
    registrations: ['up-1']
  };
}

export function initDatabase() {
  if (dbCache) return dbCache;

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      dbCache = JSON.parse(raw);
      if (!Array.isArray(dbCache.autoBids)) dbCache.autoBids = [];
      if (!Array.isArray(dbCache.messages)) dbCache.messages = [];
      console.log(`[Veyra DB] Loaded database with ${dbCache.auctions?.length || 0} auctions, ${dbCache.products?.length || 0} products.`);
      return dbCache;
    } catch (err) {
      console.warn('[Veyra DB] Failed to parse db.json, re-initializing from defaults:', err);
    }
  }

  // Production vs Dev/Demo initialization
  const isProd = process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_DATA !== 'true';
  if (isProd) {
    dbCache = {
      products: [],
      auctions: [],
      autoBids: [],
      messages: [],
      reminders: [],
      registrations: []
    };
    persistDatabaseSync();
    console.log('[Veyra DB] Initialized clean production database (empty catalog).');
    return dbCache;
  }

  // Development/Demo seed data
  dbCache = seedDemoData();
  persistDatabaseSync();
  console.log('[Veyra DB] Initialized and seeded fresh db.json with demo lots.');
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
      const tmpPath = `${DB_PATH}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(dbCache, null, 2), 'utf8');
      await fs.promises.rename(tmpPath, DB_PATH);
    } catch (err) {
      console.error('[Veyra DB] Error persisting database to disk:', err);
    }
  });
  return saveQueue;
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

// Auto-Bid operations (confidential user settings stored server-side only)
export function getAutoBids(auctionId) {
  const db = getDatabase();
  if (!Array.isArray(db.autoBids)) db.autoBids = [];
  return db.autoBids.filter((ab) => ab.auctionId === auctionId);
}

export function getUserAutoBid(auctionId, userId) {
  const db = getDatabase();
  if (!Array.isArray(db.autoBids)) db.autoBids = [];
  return db.autoBids.find((ab) => ab.auctionId === auctionId && ab.userId === userId) || null;
}

export function upsertAutoBid(config) {
  const db = getDatabase();
  if (!Array.isArray(db.autoBids)) db.autoBids = [];
  const index = db.autoBids.findIndex((ab) => ab.auctionId === config.auctionId && ab.userId === config.userId);
  const now = Date.now();
  if (index !== -1) {
    db.autoBids[index] = {
      ...db.autoBids[index],
      ...config,
      updatedAt: now
    };
    saveDatabase();
    return db.autoBids[index];
  } else {
    const newConfig = {
      id: 'ab-' + now + '-' + Math.random().toString(36).slice(2, 6),
      ...config,
      createdAt: now,
      updatedAt: now
    };
    db.autoBids.push(newConfig);
    saveDatabase();
    return newConfig;
  }
}

export function updateAutoBid(id, updates) {
  const db = getDatabase();
  if (!Array.isArray(db.autoBids)) db.autoBids = [];
  const index = db.autoBids.findIndex((ab) => ab.id === id);
  if (index === -1) return null;
  db.autoBids[index] = { ...db.autoBids[index], ...updates, updatedAt: Date.now() };
  saveDatabase();
  return db.autoBids[index];
}

export function deleteUserAutoBid(auctionId, userId) {
  const db = getDatabase();
  if (!Array.isArray(db.autoBids)) db.autoBids = [];
  const index = db.autoBids.findIndex((ab) => ab.auctionId === auctionId && ab.userId === userId);
  if (index !== -1) {
    const removed = db.autoBids.splice(index, 1)[0];
    saveDatabase();
    return removed;
  }
  return null;
}

// Auction Messages operations
export function getAuctionMessages(auctionId) {
  const db = getDatabase();
  if (!Array.isArray(db.messages)) db.messages = [];
  return db.messages.filter((m) => m.auctionId === auctionId).sort((a, b) => a.timestamp - b.timestamp);
}

export function insertAuctionMessage(message) {
  const db = getDatabase();
  if (!Array.isArray(db.messages)) db.messages = [];
  const record = {
    id: message.id || ('msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
    auctionId: message.auctionId,
    userId: message.userId,
    sender: message.sender,
    text: message.text,
    time: message.time || 'Just now',
    timestamp: message.timestamp || Date.now()
  };
  db.messages.push(record);
  saveDatabase();
  return record;
}
