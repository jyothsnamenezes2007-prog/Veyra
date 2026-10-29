import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { PRODUCTS, CATEGORIES } from '../data/products';
import { useToast } from './ToastContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSocket } from '../lib/socket';

const ProductsContext = createContext(null);
const CUSTOM_PRODUCTS_KEY = 'veyra_custom_products';

export const ProductsProvider = ({ children }) => {
  const { addToast } = useToast();
  const [supabaseProducts, setSupabaseProducts] = useState([]);
  const [isSupabaseLoading, setIsSupabaseLoading] = useState(false);
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

  // 1. Fetch persistent products from Supabase
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let isMounted = true;
    setIsSupabaseLoading(true);

    async function fetchSupabaseCatalog() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('Error reading products from Supabase:', error.message);
          return;
        }

        if (isMounted && Array.isArray(data) && data.length > 0) {
          const mapped = data.map((row) => {
            const baseline = PRODUCTS.find((p) => p.id === row.legacy_id || p.id === row.id) || {};
            return {
              ...baseline,
              id: row.legacy_id || row.id,
              supabaseId: row.id,
              name: row.title || baseline.name || 'Artisan Creation',
              title: row.title || baseline.title || baseline.name || 'Artisan Creation',
              description: row.description || baseline.description || '',
              price: Number(row.price || baseline.price || 0),
              category: row.category || baseline.category || 'Handmade',
              seller: row.seller_name || baseline.seller || 'Studio Artisan',
              sellerName: row.seller_name || baseline.seller || 'Studio Artisan',
              image: row.image_url || baseline.image || '',
              images: baseline.images && baseline.images.length > 0 ? baseline.images : [row.image_url || baseline.image].filter(Boolean),
              status: row.status || 'active',
              inStock: baseline.inStock !== undefined ? baseline.inStock : true,
              rating: baseline.rating || 5.0
            };
          });
          setSupabaseProducts(mapped);
        }
      } catch (err) {
        console.warn('Failed to connect to Supabase products table:', err);
      } finally {
        if (isMounted) setIsSupabaseLoading(false);
      }
    }

    fetchSupabaseCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Synchronize with local server database & subscribe to Socket.IO real-time events
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

    const socket = getSocket();
    if (socket) {
      const handleProductCreated = (payload) => {
        if (payload?.product && isMounted) {
          setCustomProducts((prev) => {
            if (prev.some((p) => p.id === payload.product.id)) return prev;
            return [payload.product, ...prev];
          });
        }
      };

      const handleProductDeleted = (payload) => {
        if (payload?.productId && isMounted) {
          setCustomProducts((prev) => prev.filter((p) => p.id !== payload.productId));
          setSupabaseProducts((prev) => prev.filter((p) => p.id !== payload.productId && p.legacy_id !== payload.productId && p.supabaseId !== payload.productId));
        }
      };

      const handleProductApproved = (payload) => {
        if (payload?.product?.id && isMounted) {
          setCustomProducts((prev) =>
            prev.map((p) => (p.id === payload.product.id ? { ...p, listingStatus: 'active' } : p))
          );
        }
      };

      const handleProductRejected = (payload) => {
        if (payload?.product?.id && isMounted) {
          setCustomProducts((prev) =>
            prev.map((p) => (p.id === payload.product.id ? { ...p, listingStatus: 'rejected' } : p))
          );
        }
      };

      socket.on('PRODUCT_CREATED', handleProductCreated);
      socket.on('PRODUCT_DELETED', handleProductDeleted);
      socket.on('PRODUCT_APPROVED', handleProductApproved);
      socket.on('PRODUCT_REJECTED', handleProductRejected);

      return () => {
        isMounted = false;
        socket.off('PRODUCT_CREATED', handleProductCreated);
        socket.off('PRODUCT_DELETED', handleProductDeleted);
        socket.off('PRODUCT_APPROVED', handleProductApproved);
        socket.off('PRODUCT_REJECTED', handleProductRejected);
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Base catalog: Prefer Supabase products if loaded, fallback to PRODUCTS sample catalog
  const allProducts = useMemo(() => {
    const baseCatalog = supabaseProducts.length > 0 ? supabaseProducts : PRODUCTS;
    const baseIds = new Set(baseCatalog.map((p) => p.id));
    const uniqueCustom = customProducts.filter((p) => !baseIds.has(p.id));
    return [...uniqueCustom, ...baseCatalog];
  }, [customProducts, supabaseProducts]);

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

    // Authoritative server persistence (server coordinates Supabase sync & validation)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.product) {
          setCustomProducts((prev) => [json.product, ...prev.filter((p) => p.id !== newProduct.id)]);
          return json.product;
        }
      }
    } catch (e) {
      console.warn('[ProductsContext] Backend offline, falling back to optimistic local state:', e.message);
    }

    setCustomProducts((prev) => [newProduct, ...prev]);
    return newProduct;
  }, []);

  const getProductById = useCallback(
    (id) => {
      return allProducts.find((p) => p.id === id || p.supabaseId === id || p.auctionId === id || p.upcomingId === id);
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
        addToast(data.error || 'Unauthorized: You can only delete your own products.', 'error');
        return { success: false, error: data.error || 'Unauthorized' };
      }
      if (!res.ok) {
        addToast(data.error || 'Failed to delete product.', 'error');
        return { success: false, error: data.error || 'Delete failed' };
      }
    } catch (e) {
      // Local fallback if offline
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('products').delete().or(`id.eq.${productId},legacy_id.eq.${productId}`);
      } catch (e) {}
    }

    setCustomProducts((prev) => prev.filter((p) => p.id !== productId));
    setSupabaseProducts((prev) => prev.filter((p) => p.id !== productId && p.legacy_id !== productId && p.supabaseId !== productId));
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
        deleteProduct,
        isSupabaseLoading
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
