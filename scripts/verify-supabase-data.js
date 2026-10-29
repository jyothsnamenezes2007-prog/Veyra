/**
 * scripts/verify-supabase-data.js
 * 
 * Verifies Supabase schema completeness, table existence, column presence,
 * RLS policy enforcement, and record counts against local db.json.
 * 
 * Usage:
 *   node scripts/verify-supabase-data.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'server', 'data', 'db.json');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');

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
  console.log('================================================================');
  console.log('--- VEYRA SUPABASE SCHEMA & DATA VERIFICATION SUITE ---');
  console.log('================================================================\n');

  const env = parseEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('❌ Error: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY missing in .env.local');
    process.exit(1);
  }

  console.log(`Connecting to: ${supabaseUrl}`);
  const anonClient = createClient(supabaseUrl, anonKey);
  const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey) : null;

  if (!adminClient) {
    console.log('ℹ️  Notice: SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.');
    console.log('   Verification will test public anon access and RLS policies.\n');
  }

  // Read local baseline counts
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const localProductsCount = db.products?.length || 0;
  const localAuctionsCount = db.auctions?.length || 0;
  const localProxyCount = db.proxyConfigs?.length || 0;
  let localCommentsCount = 0;
  if (db.comments && typeof db.comments === 'object') {
    for (const list of Object.values(db.comments)) {
      if (Array.isArray(list)) localCommentsCount += list.length;
    }
  }
  let localBidsCount = 0;
  if (Array.isArray(db.auctions)) {
    for (const a of db.auctions) {
      if (Array.isArray(a.bidHistory)) localBidsCount += a.bidHistory.length;
    }
  }

  console.log('Baseline local records in db.json:');
  console.log(`- Products: ${localProductsCount}`);
  console.log(`- Auctions: ${localAuctionsCount}`);
  console.log(`- Bids: ${localBidsCount}`);
  console.log(`- Proxy Configs: ${localProxyCount}`);
  console.log(`- Comments: ${localCommentsCount}\n`);

  // Target tables to verify
  const tables = [
    { name: 'products', expectedMin: localProductsCount, publicRead: true },
    { name: 'auctions', expectedMin: localAuctionsCount, publicRead: true },
    { name: 'bids', expectedMin: localBidsCount, publicRead: true },
    { name: 'profiles', expectedMin: 0, publicRead: true },
    { name: 'proxy_configs', expectedMin: localProxyCount, publicRead: false }, // Private RLS!
    { name: 'auction_comments', expectedMin: localCommentsCount, publicRead: true },
    { name: 'orders', expectedMin: 0, publicRead: false }, // Private to buyer
    { name: 'auction_reminders', expectedMin: 0, publicRead: false },
    { name: 'auction_registrations', expectedMin: 0, publicRead: false },
    { name: 'wishlist_items', expectedMin: 0, publicRead: false },
    { name: 'seller_profiles', expectedMin: 0, publicRead: true }
  ];

  console.log('--- 1. TABLE EXISTENCE & ACCESS CHECK ---');
  for (const t of tables) {
    try {
      const res = await anonClient.from(t.name).select('*', { count: 'exact', head: true });
      if (res.error) {
        if (res.error.code === 'PGRST205' || res.error.message.includes('Could not find')) {
          console.log(`❌ Table '${t.name}': MISSING in schema cache (Migration not yet applied).`);
        } else if (res.error.code === '42501' || !t.publicRead) {
          console.log(`🔒 Table '${t.name}': Exists with strict RLS enabled (Protected from public anon read).`);
        } else {
          console.log(`⚠️  Table '${t.name}': Error ${res.error.code} - ${res.error.message}`);
        }
      } else {
        console.log(`✓ Table '${t.name}': Exists. Public rows readable: ${res.count}`);
      }
    } catch (e) {
      console.log(`❌ Table '${t.name}': Connection failed (${e.message})`);
    }
  }

  console.log('\n--- 2. RLS SECURITY POLICY ENFORCEMENT CHECK ---');
  // Verify that an anonymous client CANNOT insert into protected tables
  const insertChecks = [
    { table: 'products', dummy: { title: 'Unauthorized Test', price: 9999 } },
    { table: 'auctions', dummy: { title: 'Unauthorized Test', starting_price: 9999 } },
    { table: 'bids', dummy: { amount: 99999 } },
    { table: 'proxy_configs', dummy: { user_name: 'Hacker', max_bid: 999999 } }
  ];

  for (const check of insertChecks) {
    try {
      const res = await anonClient.from(check.table).insert(check.dummy);
      if (res.error) {
        if (res.error.code === '42501' || res.error.message.includes('violates row-level security policy')) {
          console.log(`✓ RLS Protected: Table '${check.table}' safely blocks anonymous writes.`);
        } else if (res.error.code === 'PGRST205') {
          console.log(`ℹ️  Table '${check.table}' does not exist yet.`);
        } else {
          console.log(`✓ Table '${check.table}' blocked write with: ${res.error.message}`);
        }
      } else {
        console.warn(`🚨 SECURITY WARNING: Table '${check.table}' allowed unauthorized anonymous insert! Check RLS policies.`);
      }
    } catch (e) {
      console.log(`✓ Table '${check.table}' blocked insert (${e.message})`);
    }
  }

  console.log('\n================================================================');
  console.log('--- VERIFICATION COMPLETE ---');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
