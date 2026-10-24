import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const WishlistContext = createContext(null);
const WISHLIST_STORAGE_KEY = 'veyra_wishlist_items';

const isUuid = (str) =>
  typeof str === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export const WishlistProvider = ({ children }) => {
  const { addToast } = useToast();
  const { user } = useAuth();

  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn('Failed to parse wishlist from localStorage', err);
      return [];
    }
  });

  // Save to localStorage as offline cache
  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn('Failed to save wishlist to localStorage', err);
    }
  }, [items]);

  // Sync with Supabase watchlists table when authenticated user changes
  const syncWithSupabase = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('watchlists')
        .select(`
          id,
          product_id,
          auction_id,
          product:products(*)
        `)
        .eq('user_id', user.id);

      if (!error && Array.isArray(data)) {
        // Merge Supabase watchlisted products with local items
        const dbProducts = data
          .map((row) => row.product)
          .filter(Boolean)
          .map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            category: p.category,
            seller: p.seller_name || 'Studio Atelier',
            sellerId: p.seller_id,
            image: p.primary_image || (p.images && p.images[0]) || '',
            inStock: Boolean(p.in_stock)
          }));

        if (dbProducts.length > 0) {
          setItems((prev) => {
            const map = new Map();
            prev.forEach((item) => map.set(item.id, item));
            dbProducts.forEach((item) => map.set(item.id, item));
            return Array.from(map.values());
          });
        }
      }
    } catch (err) {
      console.warn('Failed to sync watchlist with Supabase:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    syncWithSupabase();
  }, [syncWithSupabase]);

  const isInWishlist = (productId) => {
    return items.some((item) => item.id === productId);
  };

  const toggleWishlist = async (product) => {
    if (!product || !product.id) return;

    if (isInWishlist(product.id)) {
      setItems((prev) => prev.filter((item) => item.id !== product.id));
      addToast(`"${product.name}" removed from wishlist.`);

      if (isSupabaseConfigured && supabase && user?.id && isUuid(product.id)) {
        try {
          await supabase
            .from('watchlists')
            .delete()
            .eq('user_id', user.id)
            .eq('product_id', product.id);
        } catch (e) {
          console.warn('Failed to remove from Supabase watchlist:', e);
        }
      }
    } else {
      setItems((prev) => [...prev, product]);
      addToast(`"${product.name}" saved to wishlist.`);

      if (isSupabaseConfigured && supabase && user?.id && isUuid(product.id)) {
        try {
          await supabase.from('watchlists').insert({
            user_id: user.id,
            product_id: product.id
          });
        } catch (e) {
          console.warn('Failed to add to Supabase watchlist:', e);
        }
      }
    }
  };

  const removeFromWishlist = async (productId) => {
    const item = items.find((i) => i.id === productId);
    setItems((prev) => prev.filter((i) => i.id !== productId));
    if (item) {
      addToast(`"${item.name}" removed from wishlist.`);
    }

    if (isSupabaseConfigured && supabase && user?.id && isUuid(productId)) {
      try {
        await supabase
          .from('watchlists')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
      } catch (e) {
        console.warn('Failed to remove from Supabase watchlist:', e);
      }
    }
  };

  return (
    <WishlistContext.Provider
      value={{
        items,
        toggleWishlist,
        isInWishlist,
        removeFromWishlist,
        wishlistCount: items.length
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
