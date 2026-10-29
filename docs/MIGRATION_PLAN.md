# Veyra Marketplace — Production Supabase Data Migration & Rollback Plan

This document details the schema design, field mappings, security posture, execution procedures, and rollback plans for migrating Veyra from local JSON (`server/data/db.json` and client `localStorage`) to Supabase as the single authoritative production database.

---

## 1. Architecture Overview

### Target State
- **Supabase PostgreSQL**: Single source of truth for all persistent entities (products, auctions, bids, auto-bidding configurations, floor comments, orders, reminders, registrations, wishlist).
- **Node.js Backend**: Authoritative business logic, auction background scheduler (1-second tick loop), bid mutex locking (`withAuctionLock`), Gemini AI decision reasoning, and Server-Sent Events (SSE) broadcasting.
- **Client (React / Vite)**: Public anonymous read access for catalog browsing; authenticated writes through backend REST APIs or RLS-protected Supabase client.
- **Local JSON**: Preserved purely as an offline developer fixture and test suite mock (`NODE_ENV === 'test'`); never a competing production database.

---

## 2. Comprehensive Entity Mapping

### A. Products (`db.json products` ➔ `public.products`)
| Local `db.json` Field | Supabase `products` Column | Data Type | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| `id` (e.g. `'prod-1'`) | `id` | `uuid` | Fixed UUID for seeds 1–20; deterministic UUID for custom listings. |
| `id` | `legacy_id` | `text UNIQUE` | Preserves original ID for lookup and backward compatibility. |
| `name` / `title` | `title` | `text NOT NULL` | Title of the artisan creation. |
| `description` | `description` | `text` | Item description and narrative. |
| `price` | `price` | `numeric NOT NULL` | Unit price in INR. |
| `category` | `category` | `text` | Category taxonomy (Handmade, Collectibles, etc.). |
| `image` / `images[0]` | `image_url` | `text` | Primary product photography. |
| `images` | `images` | `jsonb` | Full array of gallery image URLs. |
| `materials` | `materials` | `text` | Atelier materials used. |
| `dimensions` | `dimensions` | `text` | Physical dimensions. |
| `condition` | `condition` | `text` | Condition report. |
| `availability` | `availability` | `text` | Stock and fulfillment status. |
| `rating` | `rating` | `numeric` | Curated rating (default 5.0). |
| `featured` | `featured` | `boolean` | Featured flag on homepage. |
| `inStock` | `in_stock` | `boolean` | Availability toggle. |
| `type` / `isAuction` | `type`, `is_auction` | `text`, `boolean` | Distinguishes normal shop products from auction lots. |
| `auctionId` | `auction_id` | `text` | Paired auction ID if lot. |
| `listingStatus` | `status` | `text` | Normalized to `'active'`, `'pending'`, `'rejected'`, `'sold'`. |
| `sellerId` | `seller_id` | `uuid NULL` | Nullable foreign key to `auth.users(id)`. |
| `seller` | `seller_name` | `text` | Display name of the artisan workshop. |
| `listedAt` | `created_at` | `timestamptz` | ISO 8601 creation timestamp. |

---

### B. Auctions (`db.json auctions` ➔ `public.auctions`)
| Local `db.json` Field | Supabase `auctions` Column | Data Type | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| `id` (e.g. `'auc-1'`) | `id` | `uuid` | Fixed UUID for seeds 1–8; deterministic UUID for custom lots. |
| `id` | `legacy_id` | `text UNIQUE` | Preserves original ID for lookup and backward compatibility. |
| `name` | `title` | `text NOT NULL` | Lot title. |
| `description` | `description` | `text` | Lot description and archival documentation. |
| `startingBid` | `starting_price` | `numeric NOT NULL` | Floor opening bid in INR. |
| `currentBid` | `current_price` | `numeric NOT NULL` | Leading bid amount. |
| `minIncrement` | `min_increment` | `numeric NOT NULL` | Dynamic minimum increment (default 500). |
| `reservePrice` | `reserve_price` | `numeric NULL` | Optional reserve price threshold. |
| `estimatedValue` | `estimated_value` | `numeric NULL` | Curator estimate. |
| `bidCount` | `bid_count` | `integer NOT NULL` | Total bids placed count. |
| `startTimestamp` | `starts_at` | `timestamptz NOT NULL` | Converted from epoch ms to ISO timestamptz. |
| `endTimestamp` | `ends_at` | `timestamptz NOT NULL` | Converted from epoch ms to ISO timestamptz. |
| `status` | `status` | `text NOT NULL` | `'scheduled'`, `'active'`, `'ended'`, `'cancelled'`, `'rejected'`. |
| `approvalStatus` | `approval_status` | `text NOT NULL` | `'approved'`, `'pending'`, `'rejected'`. |
| `sellerId` | `seller_id` | `uuid NULL` | Nullable foreign key to `auth.users(id)`. |
| `seller` / `maker` | `seller_name` | `text` | Seller display name. |
| `image` / `images[0]` | `image_url` | `text` | Primary lot image. |
| `images` | `images` | `jsonb` | Array of high-resolution images. |
| `materials` | `materials` | `text` | Medium / fabrication materials. |
| `dimensions` | `dimensions` | `text` | Physical dimensions. |
| `condition` | `condition` | `text` | Curated condition report. |
| `provenance` | `provenance` | `text` | Archival ownership documentation. |
| `authenticityCertificate` | `authenticity_certificate`| `text` | Verification certificate details. |
| `winner.bidderId` | `winner_id` | `uuid NULL` | Winner user UUID if registered. |
| `winner.bidder` | `winner_name` | `text NULL` | Winner display name. |
| `winner.amount` | `winning_bid` | `numeric NULL` | Winning hammer price. |
| `result` | `result` | `text NULL` | `'sold'`, `'unsold'`, or null. |
| `category` | `category` | `text` | Taxonomy classification. |
| `location` | `location` | `text` | Atelier / gallery origin. |
| `productId` | `product_id` | `text NULL` | Cross-reference to product catalog. |
| `submittedAt` | `created_at` | `timestamptz` | Lot submission timestamp. |

---

### C. Bids (`db.json auction.bidHistory` ➔ `public.bids`)
| Local Bid Object Field | Supabase `bids` Column | Data Type | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| `id` (e.g. `'b-1792...'`) | `id` | `uuid` | Deterministically generated UUID. |
| `id` | `legacy_bid_id` | `text UNIQUE` | Preserves original ID for idempotency. |
| `auction.id` | `auction_id` | `uuid NOT NULL` | Foreign key referencing `public.auctions(id)`. |
| `auction.id` | `legacy_auction_id`| `text` | Original auction ID. |
| `bidderId` | `bidder_id` | `uuid NULL` | Nullable (does not fabricate fake `auth.users` UUIDs). |
| `bidder` / `bidderName`| `bidder_name` | `text NOT NULL` | Display name of the bidder. |
| `amount` | `amount` | `numeric NOT NULL` | Bid amount in INR. |
| `isProxyBid` | `is_proxy` | `boolean DEFAULT false` | Indicates if placed by auto-bidding engine. |
| `timestamp` | `created_at` | `timestamptz NOT NULL` | Converted from epoch ms to ISO timestamptz. |

---

### D. Proxy Auto-Bidding (`db.json proxyConfigs` ➔ `public.proxy_configs`)
| Local Proxy Config Field | Supabase `proxy_configs` Column | Data Type | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| `id` (e.g. `'pb-...'`) | `id` | `uuid` | Deterministically generated UUID. |
| `id` | `legacy_id` | `text UNIQUE` | Preserves original ID. |
| `auctionId` | `auction_id` | `uuid NOT NULL` | Foreign key referencing `public.auctions(id)`. |
| `auctionId` | `legacy_auction_id` | `text` | Original auction ID. |
| `userId` | `user_id` | `uuid NULL` | User UUID when authenticated. |
| `userName` | `user_name` | `text NOT NULL` | Collector display name. |
| `maxBid` | `max_bid` | `numeric NOT NULL` | **PRIVATE BUDGET: Protected by strict user-only RLS.** |
| `preferredIncrement` | `preferred_increment` | `numeric DEFAULT 500` | Preferred bidding step. |
| `status` | `status` | `text NOT NULL` | `'active'`, `'outbid_stopped'`, `'disabled'`. |
| `stopReason` | `stop_reason` | `text NULL` | Explanatory message when limit reached. |
| `lastBidAmount` | `last_bid_amount` | `numeric NULL` | Highest bid placed on behalf of user. |
| `lastBidTime` | `last_bid_time` | `timestamptz NULL` | Timestamp of last auto-bid placement. |
| `aiReasoning` | `ai_reasoning` | `text NULL` | Gemini AI evaluation transcript. |
| `createdAt` | `created_at` | `timestamptz` | Configuration creation timestamp. |
| `updatedAt` | `updated_at` | `timestamptz` | Last updated timestamp. |

---

### E. Floor Chat Comments (`db.json comments` ➔ `public.auction_comments`)
| Local Comment Field | Supabase `auction_comments` Column | Data Type | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| `id` (e.g. `'c-1'`) | `id` | `uuid` | Deterministically generated UUID. |
| `id` | `legacy_id` | `text UNIQUE` | Preserves original comment ID. |
| `auctionId` | `auction_id` | `uuid NOT NULL` | Foreign key referencing `public.auctions(id)`. |
| `auctionId` | `legacy_auction_id` | `text` | Original auction ID. |
| `userId` | `user_id` | `uuid NULL` | Author user UUID if authenticated. |
| `user` / `userName` | `user_name` | `text NOT NULL` | Author handle or curator name. |
| `message` / `text` | `message` | `text NOT NULL` | Chat message body. |
| `verifiedCollector` | `verified_collector` | `boolean DEFAULT false` | Verified collector badge. |
| `timestamp` | `created_at` | `timestamptz` | Post timestamp. |

---

### F. Orders & Checkout (`localStorage` ➔ `public.orders`)
| Client Order Field | Supabase `orders` Column | Data Type | Notes / Transformation |
| :--- | :--- | :--- | :--- |
| `id` (e.g. `'VY-749102'`)| `id` | `text PRIMARY KEY` | Preserves human-readable order tracking ID. |
| User session ID | `buyer_id` | `uuid NULL` | Foreign key referencing `auth.users(id)`. |
| `name` | `buyer_name` | `text` | Customer shipping recipient. |
| `email` | `buyer_email` | `text` | Customer invoice email. |
| `subtotal` | `subtotal` | `numeric NOT NULL` | Item merchandise sum. |
| `shipping` | `shipping` | `numeric DEFAULT 0` | White-glove insured delivery cost. |
| `total` | `total` | `numeric NOT NULL` | Final invoice total. |
| `status` | `status` | `text NOT NULL` | `'Confirmed'`, `'Processing'`, `'Shipped'`, `'Delivered'`. |
| `carrier` | `carrier` | `text` | Delivery carrier. |
| `trackingNumber` | `tracking_number` | `text` | Carrier consignment number. |
| `items` | `items` | `jsonb NOT NULL` | Purchased item snapshot array (name, price, qty). |
| `shippingAddress` | `shipping_address` | `jsonb` | Delivery address. |
| `paymentReference` | `payment_reference` | `text` | Gateway reference ID. |
| `date` | `created_at` | `timestamptz` | Order completion timestamp. |

---

## 3. Security & Row-Level Security (RLS) Policy Blueprint

| Table | Operation | Policy Rule | Security Rationale |
| :--- | :--- | :--- | :--- |
| `products` | `SELECT` | `USING (true)` | Public marketplace catalog browsing. |
| `products` | `INSERT` | `WITH CHECK (auth.uid() = seller_id OR seller_id IS NULL)` | Prevents posting on behalf of other sellers. |
| `products` | `UPDATE/DELETE` | `USING (auth.uid() = seller_id)` | Sellers can only manage their own products. |
| `auctions` | `SELECT` | `USING (true)` | Public auction schedule and room viewing. |
| `auctions` | `INSERT` | `WITH CHECK (auth.uid() = seller_id OR seller_id IS NULL)` | Authenticated auction lot submissions. |
| `auctions` | `UPDATE` | `USING (auth.uid() = seller_id AND approval_status = 'pending')` | Prevents sellers from tampering with live/ended lots or falsifying winning outcomes. |
| `bids` | `SELECT` | `USING (true)` | Floor room bid transparency. |
| `bids` | `INSERT` | `WITH CHECK (auth.uid() = bidder_id)` | Validates bidder identity; server uses service-role for authoritative proxy bids. |
| **`proxy_configs`**| **`SELECT`** | **`USING (auth.uid() = user_id)`** | **STRICT PRIVACY: Maximum budgets are completely hidden from all other users and competing bidders.** |
| **`proxy_configs`**| **`INSERT/UPDATE`** | **`USING (auth.uid() = user_id)`** | Users manage only their own auto-bidding configurations. |
| `auction_comments` | `SELECT` | `USING (true)` | Floor room discussion is publicly visible. |
| `auction_comments` | `INSERT` | `WITH CHECK (auth.uid() = user_id OR user_id IS NULL)` | Prevents posting as another user. |
| `orders` | `SELECT` | `USING (auth.uid() = buyer_id)` | Buyers can only view their own order invoices. |
| `orders` | `INSERT` | `WITH CHECK (auth.uid() = buyer_id OR buyer_id IS NULL)` | Creates orders attached to buyer account. |
| `reminders` | `ALL` | `USING (auth.uid() = user_id)` | Private auction alert subscriptions. |
| `registrations` | `ALL` | `USING (auth.uid() = user_id)` | Private session registration lists. |
| `wishlist_items`| `ALL` | `USING (auth.uid() = user_id)` | Private saved lot lists. |

---

## 4. Conflict Resolution & Idempotency Strategy

1. **Unique Indices on Legacy IDs**: Every table includes `UNIQUE INDEX ON table(legacy_id)`.
2. **Upsert Semantics**: All migration inserts use `ON CONFLICT (legacy_id) DO UPDATE` or `DO NOTHING`, ensuring that re-running the migration script is 100% idempotent and will never create duplicate rows.
3. **Fixed Seed UUIDs**: The 20 products and 8 auctions defined in `supabase/seed_catalog.sql` retain their exact fixed UUIDs (`00000000-0000-0000-0000-000000000001` through `20` and `00000000-0000-0001-0000-000000000001` through `08`).
4. **Deterministic UUIDs for Custom Items**: All custom products, lots, bids, and comments are mapped using `crypto.createHash('sha256').update(namespace + ':' + legacyId).digest('hex')` formatted as RFC 4122 v4 UUIDs.
5. **No Invented User Accounts**: Historical bids and catalog products where no Supabase Auth account exists leave `seller_id` or `bidder_id` as `NULL`, while preserving the human-readable display name in `seller_name` and `bidder_name`.

---

## 5. Rollback Procedure

If any issue arises during or after migration:

### Level 1: Application Switch-Back (Immediate < 1 minute)
- The Node server retains full compatibility with `server/data/db.json`.
- The data access layer in `server/db.js` is built with a dual-mode fallback:
  ```javascript
  const USE_SUPABASE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_URL);
  ```
- Removing or unsetting `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` immediately redirects the server and scheduler back to `server/data/db.json` without requiring code changes or redeployment.

### Level 2: Local Data Restoration
- A timestamped backup was created prior to any migration:
  `server/data/db.backup-2026-10-29T00-13-01-162Z.json`
- In the event of local data corruption, copy the backup back to `server/data/db.json`:
  ```bash
  cp server/data/db.backup-2026-10-29T00-13-01-162Z.json server/data/db.json
  ```

### Level 3: Remote Supabase Rollback
- The schema migration is non-destructive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). It does not drop existing tables or delete existing rows.
- If newly created tables need to be reverted, run the corresponding drop script:
  ```sql
  DROP TABLE IF EXISTS public.auction_comments;
  DROP TABLE IF EXISTS public.proxy_configs;
  DROP TABLE IF EXISTS public.orders;
  DROP TABLE IF EXISTS public.auction_reminders;
  DROP TABLE IF EXISTS public.auction_registrations;
  DROP TABLE IF EXISTS public.wishlist_items;
  DROP TABLE IF EXISTS public.seller_profiles;
  ```

---

## 6. Execution Commands (For Future Stage D)

These commands are prepared and documented for when Stage D is authorized:

```bash
# 1. Run local migration dry-run validation (Safe, read-only):
node scripts/migrate-local-to-supabase.js

# 2. Verify Supabase schema and RLS policies:
node scripts/verify-supabase-data.js

# 3. Apply remote migration (Only after Stage C explicit approval):
node scripts/migrate-local-to-supabase.js --apply
```
