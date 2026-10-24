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
        winner: null,
        bidHistory: []
      };
    })
  ];

  dbCache = {
    products: seededProducts,
    auctions: seededAuctions,
    reminders: ['up-2'],
    registrations: ['up-1']
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
