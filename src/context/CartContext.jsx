import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'veyra_cart_items';
const ORDERS_STORAGE_KEY = 'veyra_user_orders';
const RECENTLY_VIEWED_KEY = 'veyra_recently_viewed';

const isUuid = (str) =>
  typeof str === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const mapDbOrder = (row) => ({
  id: row.order_number || row.id,
  dbId: row.id,
  date: new Date(row.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }),
  items: (row.order_items || []).map((i) => ({
    id: i.product_id || i.id,
    name: i.name,
    price: Number(i.price),
    quantity: Number(i.quantity),
    seller: i.seller_name || '',
    image: i.image || ''
  })),
  subtotal: Number(row.subtotal),
  shipping: Number(row.shipping),
  total: Number(row.total),
  status: row.status || 'Confirmed',
  trackingNumber: row.tracking_number || '',
  carrier: row.carrier || 'Veyra White-Glove Insured Logistics',
  isDatabase: true
});

export const CartProvider = ({ children }) => {
  const { addToast } = useToast();
  const { user } = useAuth();

  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn('Failed to parse cart from localStorage', err);
      return [];
    }
  });

  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [
        {
          id: 'VY-749102',
          date: '14 Oct 2026',
          items: [
            {
              id: 'prod-1',
              name: 'Ochre Raku Fluted Vessel',
              price: 18500,
              quantity: 1,
              seller: 'Studio Vayu',
              image: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=600&q=80'
            }
          ],
          subtotal: 18500,
          shipping: 0,
          total: 18500,
          status: 'Delivered',
          trackingNumber: 'VY-IN-9812499',
          carrier: 'Veyra White-Glove Insured Logistics'
        }
      ];
    } catch (e) {
      return [];
    }
  });

  const [recentlyViewed, setRecentlyViewed] = useState(() => {
    try {
      const saved = localStorage.getItem(RECENTLY_VIEWED_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Sync orders with Supabase when authenticated
  const fetchSupabaseOrders = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped = data.map(mapDbOrder);
        setOrders((prev) => {
          const map = new Map();
          // Database orders take priority
          mapped.forEach((o) => map.set(o.id, o));
          // Keep initial demo orders if not in DB
          prev.forEach((o) => {
            if (!map.has(o.id)) map.set(o.id, o);
          });
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.warn('Failed to fetch orders from Supabase:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSupabaseOrders();
  }, [fetchSupabaseOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn('Failed to save cart to localStorage', err);
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch (err) {
      console.warn('Failed to save orders to localStorage', err);
    }
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(recentlyViewed));
    } catch (err) {
      console.warn('Failed to save recently viewed to localStorage', err);
    }
  }, [recentlyViewed]);

  const addToCart = (product, quantity = 1) => {
    setItems((prevItems) => {
      const existing = prevItems.find((item) => item.product.id === product.id);
      if (existing) {
        return prevItems.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevItems, { product, quantity }];
    });
    addToast(`"${product.name}" added to shopping bag.`);
  };

  const removeFromCart = (productId) => {
    const itemToRemove = items.find((i) => i.product.id === productId);
    setItems((prevItems) => prevItems.filter((item) => item.product.id !== productId));
    if (itemToRemove) {
      addToast(`"${itemToRemove.product.name}" removed from bag.`);
    }
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.product.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  // Place a completed order
  const createOrder = async (orderData) => {
    const orderNumber = 'VY-' + Math.floor(100000 + Math.random() * 900000);
    const trackingNumber = 'VY-IN-' + Math.floor(1000000 + Math.random() * 9000000);

    const newOrder = {
      id: orderNumber,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'Confirmed',
      carrier: 'Veyra White-Glove Insured Logistics',
      trackingNumber,
      ...orderData
    };

    setOrders((prev) => [newOrder, ...prev]);
    clearCart();

    // If Supabase configured and user is authenticated, persist order & order_items
    if (isSupabaseConfigured && supabase && user?.id) {
      try {
        const { data: dbOrder, error: orderErr } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            buyer_id: user.id,
            subtotal: Number(orderData.subtotal) || 0,
            shipping: Number(orderData.shipping) || 0,
            total: Number(orderData.total) || 0,
            status: 'Confirmed',
            carrier: 'Veyra White-Glove Insured Logistics',
            tracking_number: trackingNumber,
            shipping_address: orderData.shippingAddress || null
          })
          .select()
          .single();

        if (orderErr) {
          console.warn('Supabase order creation warning:', orderErr.message);
        } else if (dbOrder && Array.isArray(orderData.items) && orderData.items.length > 0) {
          const itemsPayload = orderData.items.map((i) => ({
            order_id: dbOrder.id,
            product_id: isUuid(i.id) ? i.id : null,
            name: i.name,
            price: Number(i.price),
            quantity: Number(i.quantity) || 1,
            seller_name: i.seller || '',
            image: i.image || ''
          }));

          await supabase.from('order_items').insert(itemsPayload);
          fetchSupabaseOrders();
        }
      } catch (err) {
        console.warn('Failed to insert order into Supabase:', err);
      }
    }

    return newOrder;
  };

  // Record a viewed product
  const recordRecentlyViewed = (product) => {
    if (!product || !product.id) return;
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, 10);
    });
  };

  const cartCount = items.reduce((total, item) => total + item.quantity, 0);
  const cartSubtotal = items.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        cartSubtotal,
        orders,
        createOrder,
        recentlyViewed,
        recordRecentlyViewed
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
