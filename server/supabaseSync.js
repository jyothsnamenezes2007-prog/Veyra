/**
 * Veyra Server-Side Supabase Data Access Layer & Write-Through Adapter
 *
 * Requirements:
 * - Supabase is authoritative when SUPABASE_SERVICE_ROLE_KEY is provided.
 * - Service-role key is accessed only server-side.
 * - Does not expose credentials to client.
 * - Seamless fallback to local storage if service-role key is unconfigured.
 * - Non-blocking asynchronous sync queue for microsecond auction response times.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');

// Exact match to supabase/seed_catalog.sql and scripts/migrate-local-to-supabase.js
const FIXED_UUID_MAP = {
  // Products 1-20
  'prod-1': '00000000-0000-0000-0000-000000000001',
  'prod-2': '00000000-0000-0000-0000-000000000002',
  'prod-3': '00000000-0000-0000-0000-000000000003',
  'prod-4': '00000000-0000-0000-0000-000000000004',
  'prod-5': '00000000-0000-0000-0000-000000000005',
  'prod-6': '00000000-0000-0000-0000-000000000006',
  'prod-7': '00000000-0000-0000-0000-000000000007',
  'prod-8': '00000000-0000-0000-0000-000000000008',
  'prod-9': '00000000-0000-0000-0000-000000000009',
  'prod-10': '00000000-0000-0000-0000-000000000010',
  'prod-11': '00000000-0000-0000-0000-000000000011',
  'prod-12': '00000000-0000-0000-0000-000000000012',
  'prod-auc-1': '00000000-0000-0000-0000-000000000013',
  'prod-auc-2': '00000000-0000-0000-0000-000000000014',
  'prod-auc-3': '00000000-0000-0000-0000-000000000015',
  'prod-auc-4': '00000000-0000-0000-0000-000000000016',
  'prod-up-1': '00000000-0000-0000-0000-000000000017',
  'prod-up-2': '00000000-0000-0000-0000-000000000018',
  'prod-up-3': '00000000-0000-0000-0000-000000000019',
  'prod-up-4': '00000000-0000-0000-0000-000000000020',
  // Auctions 1-8
  'auc-1': '00000000-0000-0000-0001-000000000001',
  'auc-2': '00000000-0000-0000-0001-000000000002',
  'auc-3': '00000000-0000-0000-0001-000000000003',
  'auc-4': '00000000-0000-0000-0001-000000000004',
  'up-1': '00000000-0000-0000-0001-000000000005',
  'up-2': '00000000-0000-0000-0001-000000000006',
  'up-3': '00000000-0000-0000-0001-000000000007',
  'up-4': '00000000-0000-0000-0001-000000000008'
};

export function toDeterministicUUID(namespace, legacyId) {
  if (!legacyId) return null;
  if (FIXED_UUID_MAP[legacyId]) {
    return FIXED_UUID_MAP[legacyId];
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(legacyId)) {
    return legacyId;
  }
  const hash = crypto.createHash('sha256').update(`${namespace}:${legacyId}`).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20),
    hash.substring(20, 32)
  ].join('-');
}

function loadEnvConfig() {
  const env = { ...process.env };
  if (fs.existsSync(ENV_PATH)) {
    try {
      const content = fs.readFileSync(ENV_PATH, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!env[k]) env[k] = v;
        }
      }
    } catch (e) {
      // Ignore env read errors
    }
  }
  return env;
}

const config = loadEnvConfig();
const supabaseUrl = config.VITE_SUPABASE_URL || config.SUPABASE_URL || null;
const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY || null;

let supabaseAdmin = null;

if (supabaseUrl && serviceRoleKey) {
  try {
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    console.log(`[Veyra DAL] Supabase authoritative adapter active: Connected to ${supabaseUrl}`);
  } catch (err) {
    console.warn('[Veyra DAL] Failed to initialize Supabase admin client:', err.message);
  }
} else {
  console.log('[Veyra DAL] Standby mode: SUPABASE_SERVICE_ROLE_KEY unconfigured. Local storage (db.json) active as source of truth.');
}

export function isSupabaseAuthoritative() {
  return Boolean(supabaseAdmin);
}

export function getSupabaseAdmin() {
  return supabaseAdmin;
}

/**
 * Write-Through: Product Upsert
 */
export async function syncProductUpsert(product) {
  if (!supabaseAdmin || !product) return;
  try {
    const uuid = toDeterministicUUID('product', product.id);
    const row = {
      id: uuid,
      legacy_id: product.id,
      title: product.name || product.title || 'Artisan Creation',
      description: product.description || '',
      price: Number(product.price || 0),
      category: product.category || 'Handmade',
      image_url: product.image || (Array.isArray(product.images) && product.images[0]) || '',
      images: Array.isArray(product.images) ? product.images : (product.image ? [product.image] : []),
      materials: product.materials || null,
      dimensions: product.dimensions || null,
      condition: product.condition || 'Pristine Studio Original',
      availability: product.availability || 'In Stock • Studio Direct',
      rating: Number(product.rating || 5.0),
      featured: Boolean(product.featured),
      in_stock: product.inStock !== undefined ? Boolean(product.inStock) : true,
      type: product.type || (product.isAuction ? 'auction' : 'shop'),
      is_auction: Boolean(product.isAuction || product.type === 'auction'),
      auction_id: product.auctionId || null,
      status: product.listingStatus === 'sold' ? 'sold' : product.listingStatus === 'rejected' ? 'rejected' : product.listingStatus === 'pending' ? 'pending' : 'active',
      seller_id: /^[0-9a-f-]{36}$/i.test(product.sellerId) ? product.sellerId : null,
      seller_name: product.seller || 'Studio Artisan',
      created_at: product.listedAt ? new Date(product.listedAt).toISOString() : new Date().toISOString()
    };

    const { error } = await supabaseAdmin.from('products').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Veyra DAL] Product sync warning:', error.message);
    }
  } catch (err) {
    console.warn('[Veyra DAL] Product sync exception:', err.message);
  }
}

/**
 * Write-Through: Product Delete
 */
export async function syncProductDelete(productId) {
  if (!supabaseAdmin || !productId) return;
  try {
    const uuid = toDeterministicUUID('product', productId);
    const { error } = await supabaseAdmin.from('products').delete().or(`id.eq.${uuid},legacy_id.eq.${productId}`);
    if (error) {
      console.warn('[Veyra DAL] Product delete warning:', error.message);
    }
  } catch (err) {
    console.warn('[Veyra DAL] Product delete exception:', err.message);
  }
}

/**
 * Write-Through: Auction Upsert
 */
export async function syncAuctionUpsert(auction) {
  if (!supabaseAdmin || !auction) return;
  try {
    const aucUuid = toDeterministicUUID('auction', auction.id);
    const prodUuid = auction.productId ? toDeterministicUUID('product', auction.productId) : null;
    const startMs = Number(auction.startTimestamp || auction.scheduledTimestamp || Date.now());
    const endMs = Number(auction.endTimestamp || auction.endTime || (startMs + 86400000));
    const startingBid = Number(auction.startingBid || auction.currentBid || 0);
    const currentBid = Number(auction.currentBid || startingBid);
    const minInc = Number(auction.minIncrement || Math.max(500, Math.round((startingBid * 0.05) / 500) * 500));

    const statusMap = {
      live: 'active',
      active: 'active',
      ended: 'ended',
      concluded: 'ended',
      cancelled: 'cancelled',
      scheduled: 'upcoming',
      upcoming: 'upcoming',
      pending: 'pending'
    };
    const mappedStatus = statusMap[auction.status] || 'upcoming';

    const row = {
      id: aucUuid,
      legacy_id: auction.id,
      product_id: prodUuid,
      legacy_product_id: auction.productId || null,
      title: auction.name || auction.title || 'Archival Lot',
      description: auction.description || '',
      starting_price: startingBid,
      current_price: currentBid,
      reserve_price: auction.reservePrice ? Number(auction.reservePrice) : null,
      min_increment: minInc,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      status: mappedStatus,
      bid_count: Number(auction.bidCount || (Array.isArray(auction.bidHistory) ? auction.bidHistory.length : 0)),
      winner_id: /^[0-9a-f-]{36}$/i.test(auction.winner?.bidderId || auction.winner?.id) ? (auction.winner?.bidderId || auction.winner?.id) : null,
      winner_name: auction.winner?.bidderName || auction.winner?.name || null,
      winning_bid: auction.winner?.amount ? Number(auction.winner.amount) : null,
      seller_id: /^[0-9a-f-]{36}$/i.test(auction.sellerId) ? auction.sellerId : null,
      seller_name: auction.seller || 'Studio Atelier',
      image_url: auction.image || (Array.isArray(auction.images) && auction.images[0]) || '',
      images: Array.isArray(auction.images) ? auction.images : (auction.image ? [auction.image] : []),
      extended_count: Number(auction.extendedCount || 0)
    };

    const { error } = await supabaseAdmin.from('auctions').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Veyra DAL] Auction sync warning:', error.message);
    }

    // Sync latest bids if present
    if (Array.isArray(auction.bidHistory) && auction.bidHistory.length > 0) {
      await syncBidsUpsert(auction.id, auction.bidHistory);
    }
  } catch (err) {
    console.warn('[Veyra DAL] Auction sync exception:', err.message);
  }
}

/**
 * Write-Through: Bids Upsert
 */
export async function syncBidsUpsert(auctionId, bidsList) {
  if (!supabaseAdmin || !Array.isArray(bidsList) || bidsList.length === 0) return;
  try {
    const aucUuid = toDeterministicUUID('auction', auctionId);
    const rows = bidsList.map((b) => {
      const bUuid = toDeterministicUUID('bid', b.id);
      return {
        id: bUuid,
        legacy_id: b.id,
        auction_id: aucUuid,
        bidder_id: /^[0-9a-f-]{36}$/i.test(b.bidderId) ? b.bidderId : null,
        legacy_bidder_id: b.bidderId || null,
        bidder_name: b.bidderName || b.bidder || 'Collector',
        amount: Number(b.amount || 0),
        is_proxy: Boolean(b.isProxy),
        is_winning: Boolean(b.isWinning),
        created_at: b.timestamp ? new Date(b.timestamp).toISOString() : new Date().toISOString()
      };
    });

    const { error } = await supabaseAdmin.from('bids').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('[Veyra DAL] Bids sync warning:', error.message);
    }
  } catch (err) {
    console.warn('[Veyra DAL] Bids sync exception:', err.message);
  }
}

/**
 * Write-Through: Proxy Config Upsert
 */
export async function syncProxyConfigUpsert(config) {
  if (!supabaseAdmin || !config) return;
  try {
    const cfgUuid = toDeterministicUUID('proxy', config.id || `${config.auctionId}-${config.userId}`);
    const aucUuid = toDeterministicUUID('auction', config.auctionId);
    const row = {
      id: cfgUuid,
      legacy_id: config.id,
      auction_id: aucUuid,
      legacy_auction_id: config.auctionId,
      bidder_id: /^[0-9a-f-]{36}$/i.test(config.userId) ? config.userId : null,
      legacy_bidder_id: config.userId || null,
      bidder_name: config.userName || 'Verified Collector',
      max_bid: Number(config.maxBid || 0),
      is_active: config.status === 'active',
      status: config.status || 'active',
      deactivation_reason: config.deactivationReason || null,
      gemini_confidence: config.geminiAnalysis?.confidence || null,
      gemini_recommended_max: config.geminiAnalysis?.recommendedMax || null,
      gemini_evaluation_notes: config.geminiAnalysis?.reasoning || null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin.from('proxy_configs').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Veyra DAL] Proxy config sync warning:', error.message);
    }
  } catch (err) {
    console.warn('[Veyra DAL] Proxy config sync exception:', err.message);
  }
}

/**
 * Write-Through: Comment Insert
 */
export async function syncCommentInsert(auctionId, comment) {
  if (!supabaseAdmin || !comment) return;
  try {
    const cUuid = toDeterministicUUID('comment', comment.id);
    const aucUuid = toDeterministicUUID('auction', auctionId);
    const row = {
      id: cUuid,
      legacy_id: comment.id,
      auction_id: aucUuid,
      legacy_auction_id: auctionId,
      user_id: /^[0-9a-f-]{36}$/i.test(comment.userId) ? comment.userId : null,
      user_name: comment.user || comment.userName || 'Collector',
      message: comment.message || comment.text || '',
      verified_collector: Boolean(comment.verifiedCollector || comment.verified),
      created_at: comment.timestamp ? new Date(comment.timestamp).toISOString() : new Date().toISOString()
    };

    const { error } = await supabaseAdmin.from('auction_comments').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[Veyra DAL] Comment sync warning:', error.message);
    }
  } catch (err) {
    console.warn('[Veyra DAL] Comment sync exception:', err.message);
  }
}
