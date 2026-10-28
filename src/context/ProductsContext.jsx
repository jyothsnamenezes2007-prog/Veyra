import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PRODUCTS, CATEGORIES } from '../data/products';
import { useToast } from './ToastContext';

const ProductsContext = createContext(null);
const CUSTOM_PRODUCTS_KEY = 'veyra_custom_products';

export const ProductsProvider = ({ children }) => {
  const { addToast } = useToast();
  const [customProducts, setCustomProducts] = useState(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_PRODUCTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(customProducts));
    } catch (e) {
      console.warn('Failed to save custom products to localStorage', e);
    }
  }, [customProducts]);

  // Synchronize with server
  useEffect(() => {
    let isMounted = true;
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.products)) {
          const customFromServer = data.products.filter((p) => p.id && String(p.id).startsWith('prod-'));
          if (customFromServer.length > 0) {
            setCustomProducts((prev) => {
              const prevIds = new Set(prev.map((p) => p.id));
              const merged = [...prev];
              customFromServer.forEach((p) => {
                if (!prevIds.has(p.id)) {
                  merged.unshift(p);
                }
              });
              return merged;
            });
          }
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const allProducts = [...customProducts, ...PRODUCTS];

  const addProduct = useCallback(async (productData) => {
    const isAuction = productData.isAuction === true || productData.type === 'auction';
    const type = isAuction ? 'auction' : 'shop';

    const newProduct = {
      ...productData,
      id: productData.id || ('prod-custom-' + Date.now()),
      type: type,
      isAuction: isAuction,
      rating: 5.0,
      featured: false,
      inStock: true,
      condition: productData.condition || 'Studio Mint Original',
      availability: isAuction ? 'Scheduled for Auction' : 'In Stock • Studio Direct',
      listingStatus: productData.listingStatus || 'pending',
      listedAt: new Date().toISOString(),
      images:
        productData.images && productData.images.length > 0
          ? productData.images
          : [productData.image]
    };

    // Authoritative server persistence
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to publish listing.');
      }

      const savedProduct = data.product || newProduct;
      setCustomProducts((prev) => [savedProduct, ...prev]);
      return savedProduct;
    } catch (e) {
      console.error('[ProductsContext] Upload error:', e.message);
      throw e;
    }
  }, []);

  const getProductById = useCallback(
    (id) => {
      return allProducts.find((p) => p.id === id || p.auctionId === id || p.upcomingId === id);
    },
    [allProducts]
  );

  const getMyProducts = useCallback(
    (userId) => {
      if (!userId) return [];
      return customProducts.filter((p) => p.sellerId === userId);
    },
    [customProducts]
  );

  const updateProductStatus = useCallback((productId, status) => {
    // Call server endpoint
    if (status === 'active') {
      fetch(`/api/products/${productId}/approve`, { method: 'POST' }).catch(() => {});
    } else if (status === 'rejected') {
      fetch(`/api/products/${productId}/reject`, { method: 'POST' }).catch(() => {});
    }

    setCustomProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, listingStatus: status } : p))
    );

    // Also synchronize status with any corresponding auction in customAuctions
    try {
      const savedAuctions = localStorage.getItem('veyra_custom_auctions');
      if (savedAuctions) {
        const parsed = JSON.parse(savedAuctions);
        const now = Date.now();
        const updated = parsed.map((a) => {
          if (a.productId === productId || a.id === productId) {
            const isApproved = status === 'active';
            const isRejected = status === 'rejected';
            const newApproval = isApproved ? 'approved' : isRejected ? 'rejected' : 'pending';
            const isStarted = now >= (a.scheduledTimestamp || a.startTimestamp || 0);
            const isEnded = now >= (a.endTimestamp || a.endTime || 0);
            const newStatus = !isApproved
              ? newApproval
              : isEnded
              ? 'ended'
              : isStarted
              ? 'active'
              : 'scheduled';
            return { ...a, approvalStatus: newApproval, status: newStatus };
          }
          return a;
        });
        localStorage.setItem('veyra_custom_auctions', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
      }
    } catch (e) {
      console.warn('Failed to sync auction approval status', e);
    }
  }, []);

  const deleteProduct = useCallback(async (productId, user) => {
    try {
      const userId = user?.id || (typeof user === 'string' ? user : null);
      const userName = user?.name || user?.username || '';
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userName })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        addToast(data.error || 'Unauthorized: cannot delete this product.');
        return { success: false, error: data.error };
      }
      if (!res.ok) {
        addToast(data.error || 'Failed to delete product.');
        return { success: false, error: data.error };
      }
    } catch (e) {
      // Local fallback if offline
    }

    setCustomProducts((prev) => prev.filter((p) => p.id !== productId));
    addToast('Product successfully deleted from your listings.');
    return { success: true };
  }, [addToast]);

  return (
    <ProductsContext.Provider
      value={{
        products: allProducts,
        categories: CATEGORIES,
        customProducts,
        addProduct,
        getProductById,
        getMyProducts,
        updateProductStatus,
        deleteProduct
      }}
    >
      {children}
    </ProductsContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductsProvider');
  }
  return context;
};
