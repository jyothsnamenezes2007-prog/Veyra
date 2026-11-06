import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from './ToastContext';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'veyra_cart_items';
const ORDERS_STORAGE_KEY = 'veyra_user_orders';
const RECENTLY_VIEWED_KEY = 'veyra_recently_viewed';

export const CartProvider = ({ children }) => {
  const { addToast } = useToast();

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
        // Seed an initial order for authentic collector feel
        {
          id: 'VY-749102',
          date: '14 Oct 2026',
          items: [
            {
              id: 'prod-sample-order-archived',
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
  const createOrder = (orderData) => {
    const newOrder = {
      id: 'VY-' + Math.floor(100000 + Math.random() * 900000),
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'Confirmed',
      carrier: 'Veyra White-Glove Insured Transport',
      trackingNumber: 'VY-IN-' + Math.floor(1000000 + Math.random() * 9000000),
      ...orderData
    };

    setOrders((prev) => [newOrder, ...prev]);
    clearCart();
    if (orderData?.items && Array.isArray(orderData.items)) {
      orderData.items.forEach((item) => {
        if (item?.id) {
          fetch(`/api/products/${item.id}/sold`, { method: 'POST' }).catch(() => {});
          window.dispatchEvent(new CustomEvent('veyra_product_sold', { detail: { productId: item.id } }));
        }
      });
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
