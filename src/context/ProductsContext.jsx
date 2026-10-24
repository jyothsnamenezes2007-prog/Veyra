import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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

  const [serverProducts, setServerProducts] = useState(null);

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
          setServerProducts(data.products);
        }
      })
      .catch(() => {
        if (isMounted && (!import.meta.env || !import.meta.env.PROD)) {
          setServerProducts(PRODUCTS);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // When server has responded, authoritative catalog is serverProducts.
  // In production with empty backend, newly registered buyer sees clean empty marketplace.
  const allProducts = useMemo(() => {
    if (serverProducts === null) {
      const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD && !import.meta.env?.VITE_ENABLE_DEMO_DATA;
      return isProd ? customProducts : [...customProducts, ...PRODUCTS];
    }
    const serverIds = new Set(serverProducts.map((p) => p.id));
    const pendingLocal = customProducts.filter((p) => !serverIds.has(p.id));
    return [...pendingLocal, ...serverProducts];
  }, [serverProducts, customProducts]);

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

    // Server persistence
    try {
      fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      }).catch(() => {});
    } catch (e) {}

    setCustomProducts((prev) => [newProduct, ...prev]);
    return newProduct;
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
      return allProducts.filter((p) => p.sellerId === userId);
    },
    [allProducts]
  );

  const getProductsByCategory = useCallback(
    (category) => {
      if (!category || category === 'all') return allProducts;
      return allProducts.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
      );
    },
    [allProducts]
  );

  const approveProduct = useCallback(
    async (productId) => {
      try {
        await fetch(`/api/products/${productId}/approve`, { method: 'POST' });
      } catch (e) {}

      setCustomProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, listingStatus: 'active' } : p
        )
      );
      if (serverProducts) {
        setServerProducts((prev) =>
          prev.map((p) =>
            p.id === productId ? { ...p, listingStatus: 'active' } : p
          )
        );
      }
      addToast('Listing approved and published to the marketplace.');
    },
    [serverProducts, addToast]
  );

  const rejectProduct = useCallback(
    async (productId) => {
      try {
        await fetch(`/api/products/${productId}/reject`, { method: 'POST' });
      } catch (e) {}

      setCustomProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, listingStatus: 'rejected' } : p
        )
      );
      if (serverProducts) {
        setServerProducts((prev) =>
          prev.map((p) =>
            p.id === productId ? { ...p, listingStatus: 'rejected' } : p
          )
        );
      }
      addToast('Listing rejected.');
    },
    [serverProducts, addToast]
  );

  return (
    <ProductsContext.Provider
      value={{
        products: allProducts,
        categories: CATEGORIES,
        addProduct,
        getProductById,
        getMyProducts,
        getProductsByCategory,
        approveProduct,
        rejectProduct
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
