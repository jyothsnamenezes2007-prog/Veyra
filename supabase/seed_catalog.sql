-- ==============================================================================
-- VEYRA MARKETPLACE: STEP 1 DATA MIGRATION SCRIPT
-- Safely seeds products and auctions from src/data/ into Supabase
-- ==============================================================================

-- 1. Ensure non-breaking auxiliary columns exist (preserves legacy IDs and maker names)
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS legacy_id text,
  ADD COLUMN IF NOT EXISTS seller_name text;

ALTER TABLE public.auctions 
  ADD COLUMN IF NOT EXISTS legacy_id text,
  ADD COLUMN IF NOT EXISTS seller_name text;

-- 2. Ensure seller_id allows NULL for platform-curated foundational catalog pieces
ALTER TABLE public.products ALTER COLUMN seller_id DROP NOT NULL;
ALTER TABLE public.auctions ALTER COLUMN seller_id DROP NOT NULL;

-- 2b. Harmonize status check constraints so that 'active', 'live', 'upcoming', and 'scheduled' are all valid
ALTER TABLE public.auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
ALTER TABLE public.auctions ADD CONSTRAINT auctions_status_check 
  CHECK (status IN ('active', 'live', 'upcoming', 'scheduled', 'ended', 'cancelled', 'draft'));

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check 
  CHECK (status IN ('active', 'draft', 'archived', 'pending', 'sold'));

-- 3. Ensure unique index on legacy_id so duplicates can never be created
CREATE UNIQUE INDEX IF NOT EXISTS products_legacy_id_idx ON public.products (legacy_id);
CREATE UNIQUE INDEX IF NOT EXISTS auctions_legacy_id_idx ON public.auctions (legacy_id);

-- 4. Allow public read on products and auctions if policies don't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'products' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'auctions' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "Public read auctions" ON public.auctions FOR SELECT USING (true);
  END IF;
END $$;

-- ==============================================================================
-- 5. INSERT 20 CURATED PRODUCTS (Idempotent: ON CONFLICT DO NOTHING)
-- ==============================================================================
INSERT INTO public.products (
  id,
  legacy_id,
  title,
  description,
  price,
  category,
  seller_name,
  image_url,
  status,
  created_at
)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'prod-1', 'Ochre Raku Fluted Vessel', 'Wheel-thrown stoneware vessel smoke-fired with local botanical leaves and natural ferric ochre slip. Each vessel possesses unique crazing and fire marks.', 18500, 'Handmade', 'Studio Vayu', 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000002', 'prod-2', 'Brutalist Cast Bronze Candlestick', 'Sand-cast solid bronze holder with an unlacquered living patina that deepens with use and ambient warmth.', 24000, 'Home & Living', 'Atelier Morandi', 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000003', 'prod-3', 'Archival Monotype Print: Horizon 07', 'A singular monotype hand-pulled onto 300gsm deckle-edged cotton rag. Exploring minimalism, negative space, and tonal gradients.', 32500, 'Art & Prints', 'Arjun Sen Fine Art', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000004', 'prod-4', 'Hand-loomed Wild Muga Silk Stole', 'Indigenous golden muga silk spun and hand-woven on traditional wooden throw-shuttle pit looms. Naturally lustrous and water-resilient.', 14200, 'Fashion & Accessories', 'Brahmaputra Loom Collective', 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000005', 'prod-5', 'Wabi-Sabi Stoneware Kyusu Teapot', 'Side-handled ceramic teapot with integrated clay mesh filter. Wood-fired inside an anagama kiln for 4 continuous days.', 16800, 'Handmade', 'Komorebi Ceramics', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000006', 'prod-6', 'Vintage Bauhaus Brass Task Lamp (1954)', 'Original mid-century counterbalanced articulated desk lamp in spun brass and matte graphite armature. Fully rewired with braided silk cable.', 48000, 'Vintage Finds', 'Aura Archives', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000007', 'prod-7', 'Turned Walnut Catchall & Incense Tray', 'Lathe-turned from fallen European walnut heartwood. Finished with cold-pressed Swedish linseed oil and organic beeswax.', 9500, 'Home & Living', 'Havn Studio', 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000008', 'prod-8', 'Heavy Travertine Bookend Pair', 'Hand-hewn from unpolished Roman travertine limestone with natural fossil cavities and raw chamfered edges.', 21500, 'Collectibles', 'Maison Mineral', 'https://images.unsplash.com/photo-1590736969955-71cc94801759?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000009', 'prod-9', 'Indigo Dyed Raw Linen Throw', 'Heavyweight organic linen dip-dyed eleven times in natural plant indigo vats. Fringed selvage hem with hand-stitched sashiko detail.', 13500, 'Home & Living', 'Niloufar Textiles', 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', 'prod-10', 'Solid Sandstone Sculptural Object', 'Chiseled by master stonecutters in Rajasthan from golden sandstone. An understated contemplation object for desktop or console.', 19800, 'Collectibles', 'Dharohar Craft', 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000011', 'prod-11', 'Vegetable-Tanned Saddle Leather Tote', 'Minimalist unlined carryall built from 2.5mm full-grain bridle leather with hand-peened solid copper rivets.', 27500, 'Fashion & Accessories', 'Tannery No. 4', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000012', 'prod-12', 'Geometric Linocut Diptych: Form & Silence', 'Two complementary reduction relief prints exploring spatial tension and rhythm. Edition of 20, signed and numbered by the artist.', 29000, 'Art & Prints', 'Elena Rostova', 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000013', 'prod-auc-1', 'Archival Chandigarh Teak & Cane V-Leg Chair (c. 1956)', 'Original solid Burma teak framework with renewed natural hand-woven cane seating. Features documented stenciled archival inventory numbering on the rear apron.', 96000, 'Vintage Finds', 'Pierre Jeanneret Workshop', 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000014', 'prod-auc-2', 'Monolithic Carved Basalt Contemplation Basin', 'Sculpted from a single volcanic basalt boulder. The interior is hand-ground to a mirror sheen while preserving raw mineral fissures across the outer perimeter.', 68500, 'Collectibles', 'Atelier Kuroda', 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000015', 'prod-auc-3', 'Repoussé Sterling Silver Water Ewer & Basin Set', 'Forged from 925 sterling silver using traditional south Indian chased repoussé motifs depicting stylized temple lotus petals and flowing water rhythms.', 112000, 'Collectibles', 'Master Craftsman H. Raman', 'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000016', 'prod-auc-4', 'Precision Chased Brass Astronomical Astrolabe (c. 1890)', 'Brass astrolabe quadrant featuring intricately cut rete showing major northern constellations, hand-stamped altitude circles, and original suspension ring.', 58000, 'Collectibles', 'Royal Instrument Guild', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000017', 'prod-up-1', '1970s Danish Rosewood Articulated Credenza', 'Preserved Brazilian rosewood grain with tambour roll doors and solid brass pulls. A seminal piece of Scandinavian modernism.', 145000, 'Vintage Finds', 'Ib Kofod-Larsen for Faarup Møbelfabrik', 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000018', 'prod-up-2', 'Large-scale Raku Pit-Fired Torso Sculpture', 'Single-edition stoneware smoked in sawdust and dried copper carbonates. Captures ethereal mineral iridescence.', 52000, 'Art & Prints', 'Kavita Ghosh Ceramics', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000019', 'prod-up-3', 'Antique Tibetan Silver-Inlaid Ghau Amulet Box', 'Natural turquoise, coral inlays, and filigree Buddhist auspicious emblems. Hand-forged silver body with copper backplate.', 78000, 'Collectibles', 'Himalayan Silversmith Guild (c. 1910)', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1000&q=80', 'active', now()),
  ('00000000-0000-0000-0000-000000000020', 'prod-up-4', 'Cast Bronze Freeform Low Coffee Table', 'Molten bronze cast into riverbed sand molds with hand-patinated verdigris finish. Organic perimeter evocative of natural river stones.', 120000, 'Home & Living', 'Studio Alchemist, Jaipur', 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80', 'active', now())
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 6. INSERT 8 CURATED AUCTIONS (4 Live Lots + 4 Upcoming Sessions)
-- ==============================================================================
INSERT INTO public.auctions (
  id,
  legacy_id,
  title,
  description,
  seller_name,
  image_url,
  starting_price,
  current_price,
  starts_at,
  ends_at,
  status,
  created_at
)
VALUES
  ('00000000-0000-0000-0001-000000000001', 'auc-1', 'Archival Chandigarh Teak & Cane V-Leg Chair (c. 1956)', 'Original solid Burma teak framework with renewed natural hand-woven cane seating. Features documented stenciled archival inventory numbering on the rear apron.', 'Pierre Jeanneret Workshop', 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80', 65000, 96000, now() - interval '1 hour', now() + interval '9900 seconds', 'active', now()),
  ('00000000-0000-0000-0001-000000000002', 'auc-2', 'Monolithic Carved Basalt Contemplation Basin', 'Sculpted from a single volcanic basalt boulder. The interior is hand-ground to a mirror sheen while preserving raw mineral fissures across the outer perimeter.', 'Atelier Kuroda', 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80', 45000, 68500, now() - interval '1 hour', now() + interval '15420 seconds', 'active', now()),
  ('00000000-0000-0000-0001-000000000003', 'auc-3', 'Repoussé Sterling Silver Water Ewer & Basin Set', 'Forged from 925 sterling silver using traditional south Indian chased repoussé motifs depicting stylized temple lotus petals and flowing water rhythms.', 'Master Craftsman H. Raman', 'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=1000&q=80', 80000, 112000, now() - interval '1 hour', now() + interval '4320 seconds', 'active', now()),
  ('00000000-0000-0000-0001-000000000004', 'auc-4', 'Precision Chased Brass Astronomical Astrolabe (c. 1890)', 'Brass astrolabe quadrant featuring intricately cut rete showing major northern constellations, hand-stamped altitude circles, and original suspension ring.', 'Royal Instrument Guild', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1000&q=80', 42000, 58000, now() - interval '1 hour', now() + interval '7540 seconds', 'active', now()),
  ('00000000-0000-0000-0001-000000000005', 'up-1', '1970s Danish Rosewood Articulated Credenza', 'Preserved Brazilian rosewood grain with tambour roll doors and solid brass pulls. A seminal piece of Scandinavian modernism.', 'Ib Kofod-Larsen for Faarup Møbelfabrik', 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=600&q=80', 145000, 145000, now() + interval '2 days', now() + interval '5 days', 'upcoming', now()),
  ('00000000-0000-0000-0001-000000000006', 'up-2', 'Large-scale Raku Pit-Fired Torso Sculpture', 'Single-edition stoneware smoked in sawdust and dried copper carbonates. Captures ethereal mineral iridescence.', 'Kavita Ghosh Ceramics', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=600&q=80', 52000, 52000, now() + interval '2 days', now() + interval '5 days', 'upcoming', now()),
  ('00000000-0000-0000-0001-000000000007', 'up-3', 'Antique Tibetan Silver-Inlaid Ghau Amulet Box', 'Natural turquoise, coral inlays, and filigree Buddhist auspicious emblems. Hand-forged silver body with copper backplate.', 'Himalayan Silversmith Guild (c. 1910)', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80', 78000, 78000, now() + interval '2 days', now() + interval '5 days', 'upcoming', now()),
  ('00000000-0000-0000-0001-000000000008', 'up-4', 'Cast Bronze Freeform Low Coffee Table', 'Molten bronze cast into riverbed sand molds with hand-patinated verdigris finish. Organic perimeter evocative of natural river stones.', 'Studio Alchemist, Jaipur', 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80', 120000, 120000, now() + interval '2 days', now() + interval '5 days', 'upcoming', now())
ON CONFLICT (id) DO NOTHING;
