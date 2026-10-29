-- ==============================================================================
-- VEYRA MARKETPLACE: PRODUCTION SUPABASE SCHEMA MIGRATION
-- Migration Version: 20261029000000_production_schema.sql
-- Description: Non-destructive schema expansion for production persistence.
-- Preserves existing tables, constraints, and data while adding missing entities.
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES TABLE EXPANSION & ROLE ESCALATION PROTECTION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  full_name text,
  avatar_url text,
  phone text,
  role text DEFAULT 'collector',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS studio_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified_seller boolean DEFAULT false;

-- Role validation check
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('collector', 'artisan', 'curator', 'admin'));

-- Trigger: Prevent unauthorized privilege escalation (users cannot self-promote to admin/curator)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_verified_seller IS DISTINCT FROM NEW.is_verified_seller) THEN
    -- Only allow if executed by service_role, postgres, or an existing admin
    IF current_user != 'service_role' AND current_user != 'postgres' AND (COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role') THEN
      RAISE EXCEPTION 'Unauthorized: Users cannot modify their own role or verification status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Public profiles are viewable by everyone') THEN
    CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update their own profile') THEN
    CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert their own profile') THEN
    CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ==============================================================================
-- 2. PRODUCTS TABLE EXPANSION (Non-destructive)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  title text NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0),
  category text DEFAULT 'Handmade',
  image_url text,
  status text DEFAULT 'active',
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_name text,
  created_at timestamptz DEFAULT now()
);

-- Auxiliary fields for atelier catalog attributes
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS materials text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS condition text DEFAULT 'Pristine Studio Original';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS availability text DEFAULT 'In Stock • Studio Direct';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 5.0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS in_stock boolean DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS type text DEFAULT 'shop';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_auction boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS auction_id text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Update products status constraint to support all application states
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check 
  CHECK (status IN ('active', 'draft', 'archived', 'pending', 'sold', 'rejected'));

-- Ensure unique index on legacy_id
CREATE UNIQUE INDEX IF NOT EXISTS products_legacy_id_idx ON public.products (legacy_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products (status);
CREATE INDEX IF NOT EXISTS products_seller_id_idx ON public.products (seller_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category);

-- Enable RLS on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Public read products') THEN
    CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Sellers can insert own products') THEN
    CREATE POLICY "Sellers can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = seller_id OR seller_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Sellers can update own products') THEN
    CREATE POLICY "Sellers can update own products" ON public.products FOR UPDATE USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Sellers can delete own products') THEN
    CREATE POLICY "Sellers can delete own products" ON public.products FOR DELETE USING (auth.uid() = seller_id);
  END IF;
END $$;

-- ==============================================================================
-- 3. AUCTIONS TABLE EXPANSION (Non-destructive)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  title text NOT NULL,
  description text,
  starting_price numeric NOT NULL CHECK (starting_price >= 0),
  current_price numeric NOT NULL CHECK (current_price >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text DEFAULT 'scheduled',
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_name text,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- Missing auction lifecycle, provenance, and pricing columns
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS legacy_id text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS min_increment numeric DEFAULT 500 CHECK (min_increment > 0);
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS reserve_price numeric;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS estimated_value numeric;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS bid_count integer DEFAULT 0 CHECK (bid_count >= 0);
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS winner_name text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS winning_bid numeric;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS legacy_product_id text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS materials text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS condition text DEFAULT 'Pristine Studio Original';
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS provenance text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS authenticity_certificate text;
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS category text DEFAULT 'Handmade';
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS location text DEFAULT 'Studio Atelier';
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Harmonize auction status and result check constraints
ALTER TABLE public.auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
ALTER TABLE public.auctions ADD CONSTRAINT auctions_status_check 
  CHECK (status IN ('active', 'live', 'upcoming', 'scheduled', 'ended', 'cancelled', 'draft', 'pending', 'rejected'));

ALTER TABLE public.auctions DROP CONSTRAINT IF EXISTS auctions_approval_status_check;
ALTER TABLE public.auctions ADD CONSTRAINT auctions_approval_status_check 
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.auctions DROP CONSTRAINT IF EXISTS auctions_result_check;
ALTER TABLE public.auctions ADD CONSTRAINT auctions_result_check 
  CHECK (result IN ('sold', 'unsold', 'cancelled') OR result IS NULL);

-- Indexes for performant lifecycle scheduler and queries
CREATE UNIQUE INDEX IF NOT EXISTS auctions_legacy_id_idx ON public.auctions (legacy_id);
CREATE INDEX IF NOT EXISTS auctions_status_idx ON public.auctions (status);
CREATE INDEX IF NOT EXISTS auctions_starts_at_idx ON public.auctions (starts_at);
CREATE INDEX IF NOT EXISTS auctions_ends_at_idx ON public.auctions (ends_at);
CREATE INDEX IF NOT EXISTS auctions_approval_status_idx ON public.auctions (approval_status);
CREATE INDEX IF NOT EXISTS auctions_product_id_idx ON public.auctions (product_id);

-- Enable RLS on auctions
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auctions' AND policyname = 'Public read auctions') THEN
    CREATE POLICY "Public read auctions" ON public.auctions FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auctions' AND policyname = 'Sellers can insert own auction lots') THEN
    CREATE POLICY "Sellers can insert own auction lots" ON public.auctions FOR INSERT WITH CHECK (auth.uid() = seller_id OR seller_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auctions' AND policyname = 'Sellers can update pending lots') THEN
    CREATE POLICY "Sellers can update pending lots" ON public.auctions FOR UPDATE USING (auth.uid() = seller_id AND approval_status = 'pending') WITH CHECK (auth.uid() = seller_id);
  END IF;
END $$;

-- ==============================================================================
-- 4. BIDS TABLE EXPANSION (Non-destructive)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid REFERENCES public.auctions(id) ON DELETE CASCADE,
  bidder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now()
);

-- Ensure historical/demo bids can be accommodated without invalid user UUIDs
ALTER TABLE public.bids ALTER COLUMN bidder_id DROP NOT NULL;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS bidder_name text;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS is_proxy boolean DEFAULT false;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS legacy_bid_id text;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS legacy_auction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bids_legacy_bid_id_idx ON public.bids (legacy_bid_id) WHERE legacy_bid_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bids_auction_id_idx ON public.bids (auction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bids_bidder_id_idx ON public.bids (bidder_id);

-- Enable RLS on bids
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Transparent read of competitive bid history
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bids' AND policyname = 'Public read bids') THEN
    CREATE POLICY "Public read bids" ON public.bids FOR SELECT USING (true);
  END IF;

  -- Authenticated bidders can insert their own bids with verified client ID
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bids' AND policyname = 'Authenticated insert bids') THEN
    CREATE POLICY "Authenticated insert bids" ON public.bids FOR INSERT WITH CHECK (auth.uid() = bidder_id);
  END IF;
END $$;

-- ==============================================================================
-- 5. PROXY CONFIGS TABLE (Auto-bidding)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.proxy_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  legacy_auction_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  max_bid numeric NOT NULL CHECK (max_bid > 0),
  preferred_increment numeric NOT NULL DEFAULT 500 CHECK (preferred_increment > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'outbid_stopped', 'disabled')),
  stop_reason text,
  last_bid_amount numeric,
  last_bid_time timestamptz,
  ai_reasoning text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS proxy_configs_legacy_id_idx ON public.proxy_configs (legacy_id);
CREATE INDEX IF NOT EXISTS proxy_configs_auction_id_idx ON public.proxy_configs (auction_id);
CREATE INDEX IF NOT EXISTS proxy_configs_user_id_idx ON public.proxy_configs (user_id);

-- Enable strict RLS: Maximum budget limits are PRIVATE to the user
ALTER TABLE public.proxy_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proxy_configs' AND policyname = 'Users can view own proxy configs') THEN
    CREATE POLICY "Users can view own proxy configs" ON public.proxy_configs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proxy_configs' AND policyname = 'Users can insert own proxy configs') THEN
    CREATE POLICY "Users can insert own proxy configs" ON public.proxy_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proxy_configs' AND policyname = 'Users can update own proxy configs') THEN
    CREATE POLICY "Users can update own proxy configs" ON public.proxy_configs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ==============================================================================
-- 6. AUCTION COMMENTS TABLE (Floor Room Chat)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auction_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  legacy_auction_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  message text NOT NULL CHECK (length(trim(message)) > 0),
  verified_collector boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auction_comments_legacy_id_idx ON public.auction_comments (legacy_id);
CREATE INDEX IF NOT EXISTS auction_comments_auction_id_idx ON public.auction_comments (auction_id, created_at ASC);

ALTER TABLE public.auction_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auction_comments' AND policyname = 'Public read auction comments') THEN
    CREATE POLICY "Public read auction comments" ON public.auction_comments FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auction_comments' AND policyname = 'Authenticated insert comments') THEN
    CREATE POLICY "Authenticated insert comments" ON public.auction_comments FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
END $$;

-- ==============================================================================
-- 7. ORDERS TABLE (Checkout Invoices & Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_name text,
  buyer_email text,
  subtotal numeric NOT NULL CHECK (subtotal >= 0),
  shipping numeric NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  total numeric NOT NULL CHECK (total >= 0),
  status text NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  carrier text DEFAULT 'Veyra White-Glove Insured Logistics',
  tracking_number text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipping_address jsonb,
  payment_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_buyer_id_idx ON public.orders (buyer_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Buyers can view own orders') THEN
    CREATE POLICY "Buyers can view own orders" ON public.orders FOR SELECT USING (auth.uid() = buyer_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Buyers can insert own orders') THEN
    CREATE POLICY "Buyers can insert own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = buyer_id OR buyer_id IS NULL);
  END IF;
END $$;

-- ==============================================================================
-- 8. AUCTION REMINDERS & REGISTRATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auction_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  legacy_auction_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, auction_id)
);

CREATE TABLE IF NOT EXISTS public.auction_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  legacy_auction_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, auction_id)
);

ALTER TABLE public.auction_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_registrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auction_reminders' AND policyname = 'Users manage own reminders') THEN
    CREATE POLICY "Users manage own reminders" ON public.auction_reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auction_registrations' AND policyname = 'Users manage own registrations') THEN
    CREATE POLICY "Users manage own registrations" ON public.auction_registrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ==============================================================================
-- 9. WISHLIST ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  legacy_product_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wishlist_items' AND policyname = 'Users manage own wishlist') THEN
    CREATE POLICY "Users manage own wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ==============================================================================
-- 10. SELLER ATELIER PROFILES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_handle text UNIQUE,
  display_name text NOT NULL,
  about_me text,
  shop_description text,
  avatar_url text,
  location text DEFAULT 'Studio Atelier',
  rating numeric DEFAULT 5.0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seller_profiles' AND policyname = 'Public read seller profiles') THEN
    CREATE POLICY "Public read seller profiles" ON public.seller_profiles FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seller_profiles' AND policyname = 'Sellers can manage own seller profile') THEN
    CREATE POLICY "Sellers can manage own seller profile" ON public.seller_profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;
