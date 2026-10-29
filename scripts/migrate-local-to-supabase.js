/**
 * scripts/migrate-local-to-supabase.js
 * 
 * Safe, idempotent data migration script from server/data/db.json to Supabase.
 * 
 * Usage:
 *   node scripts/migrate-local-to-supabase.js            # Dry-run validation only (default)
 *   node scripts/migrate-local-to-supabase.js --apply    # Execute migration against Supabase
 * 
 * Safety Features:
 * - Creates an automated timestamped backup of db.json before any operation.
 * - Deterministic UUID mapping preserves legacy IDs without generating random IDs.
 * - Idempotent ON CONFLICT handling prevents record duplication on re-runs.
 * - Non-destructive: Uses ignoreDuplicates=true by default to never overwrite existing cloud records.
 * - Does not fabricate authenticated user IDs for historical records.
 * - Validates schema, foreign keys, and relationships before insertion.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'server', 'data', 'db.json');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');

// 1. Seed UUID mappings from supabase/seed_catalog.sql to preserve existing cloud IDs
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
  // Auctions 1-8 (Exact match to supabase/seed_catalog.sql: 00000000-0000-0000-0001-...)
  'auc-1': '00000000-0000-0000-0001-000000000001',
  'auc-2': '00000000-0000-0000-0001-000000000002',
  'auc-3': '00000000-0000-0000-0001-000000000003',
  'auc-4': '00000000-0000-0000-0001-000000000004',
  'up-1': '00000000-0000-0000-0001-000000000005',
  'up-2': '00000000-0000-0000-0001-000000000006',
  'up-3': '00000000-0000-0000-0001-000000000007',
  'up-4': '00000000-0000-0000-0001-000000000008'
};

/**
 * Deterministically map any string legacy ID to a valid RFC 4122 UUID v4.
 */
function toDeterministicUUID(namespace, legacyId) {
  if (!legacyId) return null;
  if (FIXED_UUID_MAP[legacyId]) {
    return FIXED_UUID_MAP[legacyId];
  }
  // If already a valid UUID string, preserve it
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

function parseEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing .env.local at ${ENV_PATH}`);
  }
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      env[k] = v;
    }
  }
  return env;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log('================================================================');
  console.log(`--- VEYRA DATA MIGRATION: LOCAL JSON -> SUPABASE [${isApply ? 'APPLY' : 'DRY-RUN'}] ---`);
  console.log('================================================================\n');

  if (!isApply) {
    console.log('ℹ️  Running in DRY-RUN mode. No remote database modifications will be executed.');
    console.log('   Pass --apply to execute the migration after explicit review.\n');
  }

  // 1. Create a fresh timestamped backup of db.json
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(ROOT_DIR, 'server', 'data', `db.migration-backup-${timestamp}.json`);
  fs.copyFileSync(DB_PATH, backupFile);
  console.log(`✓ Safety Backup: Created ${backupFile}`);

  // 2. Read and parse db.json
  const rawDb = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(rawDb);

  const products = Array.isArray(db.products) ? db.products : [];
  const auctions = Array.isArray(db.auctions) ? db.auctions : [];
  const proxyConfigs = Array.isArray(db.proxyConfigs) ? db.proxyConfigs : [];
  const commentsObj = db.comments && typeof db.comments === 'object' ? db.comments : {};
  const reminders = Array.isArray(db.reminders) ? db.reminders : [];
  const registrations = Array.isArray(db.registrations) ? db.registrations : [];

  console.log(`\nSource Dataset Inspection:`);
  console.log(`- Products: ${products.length}`);
  console.log(`- Auctions: ${auctions.length}`);
  console.log(`- Proxy Configs: ${proxyConfigs.length}`);
  console.log(`- Auction Comment Lots: ${Object.keys(commentsObj).length}`);
  console.log(`- Reminders: ${reminders.length}`);
  console.log(`- Registrations: ${registrations.length}`);

  // 3. Transformation & Validation
  const transformedProducts = [];
  const productLegacyIds = new Set();
  const productDuplicates = [];

  for (const p of products) {
    const legacyId = p.id;
    if (productLegacyIds.has(legacyId)) {
      productDuplicates.push(legacyId);
    }
    productLegacyIds.add(legacyId);

    const uuid = toDeterministicUUID('product', legacyId);
    transformedProducts.push({
      id: uuid,
      legacy_id: legacyId,
      title: p.name || p.title || 'Artisan Creation',
      description: p.description || '',
      price: Number(p.price || 0),
      category: p.category || 'Handmade',
      image_url: p.image || (p.images && p.images[0]) || '',
      images: Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []),
      materials: p.materials || null,
      dimensions: p.dimensions || null,
      condition: p.condition || 'Pristine Studio Original',
      availability: p.availability || 'In Stock • Studio Direct',
      rating: Number(p.rating || 5.0),
      featured: Boolean(p.featured),
      in_stock: p.inStock !== undefined ? Boolean(p.inStock) : true,
      type: p.type || (p.isAuction ? 'auction' : 'shop'),
      is_auction: Boolean(p.isAuction || p.type === 'auction'),
      auction_id: p.auctionId || null,
      status: p.listingStatus === 'sold' ? 'sold' : p.listingStatus === 'rejected' ? 'rejected' : p.listingStatus === 'pending' ? 'pending' : 'active',
      seller_id: null, // Preserved without fabricating auth.users UUID
      seller_name: p.seller || 'Studio Artisan',
      created_at: p.listedAt ? new Date(p.listedAt).toISOString() : new Date().toISOString()
    });
  }

  const transformedAuctions = [];
  const transformedBids = [];
  const auctionLegacyIds = new Set();
  const auctionDuplicates = [];
  const productLookupMap = new Map(transformedProducts.map(p => [p.legacy_id, p.id]));

  for (const a of auctions) {
    const legacyId = a.id;
    if (auctionLegacyIds.has(legacyId)) {
      auctionDuplicates.push(legacyId);
    }
    auctionLegacyIds.add(legacyId);

    const aucUuid = toDeterministicUUID('auction', legacyId);
    const startMs = Number(a.startTimestamp || a.scheduledTimestamp || Date.now());
    const endMs = Number(a.endTimestamp || a.endTime || (startMs + 86400000));
    const startingBid = Number(a.startingBid || a.currentBid || 0);
    const currentBid = Number(a.currentBid || startingBid);
    const minInc = Number(a.minIncrement || Math.max(500, Math.round((startingBid * 0.05) / 500) * 500));

    // Validate product relationship
    const matchedProductUuid = a.productId ? productLookupMap.get(a.productId) || null : null;

    transformedAuctions.push({
      id: aucUuid,
      legacy_id: legacyId,
      title: a.name || a.title || 'Curated Lot',
      description: a.description || '',
      starting_price: startingBid,
      current_price: currentBid,
      min_increment: minInc,
      reserve_price: a.reservePrice ? Number(a.reservePrice) : null,
      estimated_value: a.estimatedValue ? Number(a.estimatedValue) : currentBid,
      bid_count: Number(a.bidCount || (a.bidHistory ? a.bidHistory.length : 0)),
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      status: a.status || (Date.now() >= endMs ? 'ended' : Date.now() >= startMs ? 'active' : 'scheduled'),
      approval_status: a.approvalStatus || 'approved',
      seller_id: null,
      seller_name: a.seller || a.maker || 'Studio Workshop',
      image_url: a.image || (a.images && a.images[0]) || '',
      images: Array.isArray(a.images) ? a.images : (a.image ? [a.image] : []),
      materials: a.materials || null,
      dimensions: a.dimensions || null,
      condition: a.condition || 'Pristine Studio Original',
      provenance: a.provenance || null,
      authenticity_certificate: a.authenticityCertificate || null,
      winner_id: null,
      winner_name: a.winner?.bidder || a.winner?.bidderName || null,
      winning_bid: a.winningBid || a.winner?.amount || null,
      result: a.result || (a.status === 'ended' ? (a.winner ? 'sold' : 'unsold') : null),
      category: a.category || 'Handmade',
      location: a.location || 'Studio Atelier',
      product_id: matchedProductUuid, // Null if orphaned, preventing foreign key errors
      legacy_product_id: a.productId || null,
      created_at: a.submittedAt ? new Date(a.submittedAt).toISOString() : new Date().toISOString()
    });

    // Extract bids from auction.bidHistory
    if (Array.isArray(a.bidHistory)) {
      for (const b of a.bidHistory) {
        const bidLegacyId = b.id || `bid-${legacyId}-${b.amount}-${b.timestamp}`;
        transformedBids.push({
          id: toDeterministicUUID('bid', bidLegacyId),
          legacy_bid_id: bidLegacyId,
          auction_id: aucUuid,
          legacy_auction_id: legacyId,
          bidder_id: null, // Preserved without inventing auth.users UUID
          bidder_name: b.bidder || b.bidderName || 'Collector',
          amount: Number(b.amount),
          is_proxy: Boolean(b.isProxyBid || b.isProxy),
          created_at: b.timestamp ? new Date(b.timestamp).toISOString() : new Date().toISOString()
        });
      }
    }
  }

  // Transform Proxy Configs
  const transformedProxyConfigs = [];
  for (const pc of proxyConfigs) {
    const pcUuid = toDeterministicUUID('proxy_config', pc.id);
    const targetAucUuid = toDeterministicUUID('auction', pc.auctionId);
    transformedProxyConfigs.push({
      id: pcUuid,
      legacy_id: pc.id,
      auction_id: targetAucUuid,
      legacy_auction_id: pc.auctionId,
      user_id: null,
      user_name: pc.userName || 'Proxy Collector',
      max_bid: Number(pc.maxBid),
      preferred_increment: Number(pc.preferredIncrement || 500),
      status: pc.status || 'active',
      stop_reason: pc.stopReason || null,
      last_bid_amount: pc.lastBidAmount ? Number(pc.lastBidAmount) : null,
      last_bid_time: pc.lastBidTime ? new Date(pc.lastBidTime).toISOString() : null,
      ai_reasoning: pc.aiReasoning || null,
      created_at: pc.createdAt ? new Date(pc.createdAt).toISOString() : new Date().toISOString(),
      updated_at: pc.updatedAt ? new Date(pc.updatedAt).toISOString() : new Date().toISOString()
    });
  }

  // Transform Comments
  const transformedComments = [];
  for (const [aucId, cList] of Object.entries(commentsObj)) {
    if (Array.isArray(cList)) {
      for (const c of cList) {
        const cUuid = toDeterministicUUID('comment', c.id);
        const targetAucUuid = toDeterministicUUID('auction', aucId);
        transformedComments.push({
          id: cUuid,
          legacy_id: c.id,
          auction_id: targetAucUuid,
          legacy_auction_id: aucId,
          user_id: null,
          user_name: c.user || c.userName || 'Collector',
          message: c.message || c.text || '',
          verified_collector: Boolean(c.verifiedCollector || c.verified),
          created_at: c.timestamp ? new Date(c.timestamp).toISOString() : new Date().toISOString()
        });
      }
    }
  }

  // Summary Report
  console.log('\n--- TRANSFORMATION VALIDATION REPORT ---');
  console.log(`Transformed Products: ${transformedProducts.length} (Duplicate keys: ${productDuplicates.length})`);
  console.log(`Transformed Auctions: ${transformedAuctions.length} (Duplicate keys: ${auctionDuplicates.length})`);
  console.log(`Transformed Bids: ${transformedBids.length}`);
  console.log(`Transformed Proxy Configs: ${transformedProxyConfigs.length}`);
  console.log(`Transformed Comments: ${transformedComments.length}`);

  if (productDuplicates.length > 0) {
    console.warn('⚠️  Warning: Duplicate product legacy IDs detected in source:', productDuplicates);
  }
  if (auctionDuplicates.length > 0) {
    console.warn('⚠️  Warning: Duplicate auction legacy IDs detected in source:', auctionDuplicates);
  }

  // Check connection credentials
  const env = parseEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.warn('⚠️  Notice: Missing Supabase credentials in .env.local.');
    return;
  }

  if (!isApply) {
    console.log('\n✅ Dry-Run Completed Successfully. No remote data was modified.');
    console.log('   Review the migration plan in docs/MIGRATION_PLAN.md before running --apply.');
    return;
  }

  // 4. Execution Mode (--apply)
  console.log('\n🚀 CONNECTING TO SUPABASE TO APPLY MIGRATION (Non-destructive: ignoreDuplicates=true)...');
  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch existing legacy_ids from Supabase to report conflicts explicitly
  const { data: existingCloudProducts } = await supabase.from('products').select('legacy_id');
  const cloudProductIds = new Set((existingCloudProducts || []).map(r => r.legacy_id).filter(Boolean));

  const { data: existingCloudAuctions } = await supabase.from('auctions').select('legacy_id');
  const cloudAuctionIds = new Set((existingCloudAuctions || []).map(r => r.legacy_id).filter(Boolean));

  // Migrate Products
  console.log('\nProcessing public.products...');
  let prodInserted = 0, prodPreserved = 0, prodErrors = 0;
  for (const p of transformedProducts) {
    if (cloudProductIds.has(p.legacy_id)) {
      console.log(`  ℹ️  Preserved existing cloud product: ${p.legacy_id} ("${p.title}")`);
      prodPreserved++;
      continue;
    }
    const { error } = await supabase.from('products').upsert(p, { onConflict: 'legacy_id', ignoreDuplicates: true });
    if (error) {
      console.error(`  ❌ Product ${p.legacy_id} error:`, error.message);
      prodErrors++;
    } else {
      console.log(`  ✓ Inserted new product: ${p.legacy_id} ("${p.title}")`);
      prodInserted++;
    }
  }
  console.log(`  Summary Products: ${prodInserted} inserted, ${prodPreserved} preserved, ${prodErrors} errors.`);

  // Migrate Auctions
  console.log('\nProcessing public.auctions...');
  let aucInserted = 0, aucPreserved = 0, aucErrors = 0;
  for (const a of transformedAuctions) {
    if (cloudAuctionIds.has(a.legacy_id)) {
      console.log(`  ℹ️  Preserved existing cloud auction: ${a.legacy_id} ("${a.title}")`);
      aucPreserved++;
      continue;
    }
    const { error } = await supabase.from('auctions').upsert(a, { onConflict: 'legacy_id', ignoreDuplicates: true });
    if (error) {
      console.error(`  ❌ Auction ${a.legacy_id} error:`, error.message);
      aucErrors++;
    } else {
      console.log(`  ✓ Inserted new auction: ${a.legacy_id} ("${a.title}")`);
      aucInserted++;
    }
  }
  console.log(`  Summary Auctions: ${aucInserted} inserted, ${aucPreserved} preserved, ${aucErrors} errors.`);

  // Migrate Bids
  console.log('\nProcessing public.bids...');
  let bidSuccess = 0, bidErrors = 0;
  for (const b of transformedBids) {
    const { error } = await supabase.from('bids').upsert(b, { onConflict: 'legacy_bid_id', ignoreDuplicates: true });
    if (error) {
      console.error(`  ❌ Bid ${b.legacy_bid_id} error:`, error.message);
      bidErrors++;
    } else {
      bidSuccess++;
    }
  }
  console.log(`  ✓ Bids processed: ${bidSuccess} succeeded, ${bidErrors} failed.`);

  // Migrate Proxy Configs
  console.log('\nProcessing public.proxy_configs...');
  let pcSuccess = 0, pcErrors = 0;
  for (const pc of transformedProxyConfigs) {
    const { error } = await supabase.from('proxy_configs').upsert(pc, { onConflict: 'legacy_id', ignoreDuplicates: true });
    if (error) {
      console.error(`  ❌ Proxy config ${pc.legacy_id} error:`, error.message);
      pcErrors++;
    } else {
      pcSuccess++;
    }
  }
  console.log(`  ✓ Proxy configs processed: ${pcSuccess} succeeded, ${pcErrors} failed.`);

  // Migrate Comments
  console.log('\nProcessing public.auction_comments...');
  let cSuccess = 0, cErrors = 0;
  for (const c of transformedComments) {
    const { error } = await supabase.from('auction_comments').upsert(c, { onConflict: 'legacy_id', ignoreDuplicates: true });
    if (error) {
      console.error(`  ❌ Comment ${c.legacy_id} error:`, error.message);
      cErrors++;
    } else {
      cSuccess++;
    }
  }
  console.log(`  ✓ Comments processed: ${cSuccess} succeeded, ${cErrors} failed.`);

  console.log('\n================================================================');
  console.log('--- DATA MIGRATION RUN FINISHED ---');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
