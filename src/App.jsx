import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { ProductsProvider } from './context/ProductsContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { AuctionProvider } from './context/AuctionContext';
import { ReviewsProvider } from './context/ReviewsContext';
import { FollowProvider } from './context/FollowContext';
import { SellerProfileProvider } from './context/SellerProfileContext';

import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ToastContainer } from './components/ToastContainer';

import { PageLoadingFallback } from './components/PageLoadingFallback';
import { Home } from './pages/Home';

const Shop = React.lazy(() => import('./pages/Shop').then((m) => ({ default: m.Shop })));
const Categories = React.lazy(() => import('./pages/Categories').then((m) => ({ default: m.Categories })));
const LiveAuctions = React.lazy(() => import('./pages/LiveAuctions').then((m) => ({ default: m.LiveAuctions })));
const UpcomingLots = React.lazy(() => import('./pages/UpcomingLots').then((m) => ({ default: m.UpcomingLots })));
const LiveAuctionRoom = React.lazy(() => import('./pages/LiveAuctionRoom').then((m) => ({ default: m.LiveAuctionRoom })));
const ProductDetails = React.lazy(() => import('./pages/ProductDetails').then((m) => ({ default: m.ProductDetails })));
const Schedule = React.lazy(() => import('./pages/Schedule').then((m) => ({ default: m.Schedule })));
const Account = React.lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const Wishlist = React.lazy(() => import('./pages/Wishlist').then((m) => ({ default: m.Wishlist })));
const Cart = React.lazy(() => import('./pages/Cart').then((m) => ({ default: m.Cart })));
const SignIn = React.lazy(() => import('./pages/SignIn').then((m) => ({ default: m.SignIn })));
const SignUp = React.lazy(() => import('./pages/SignUp').then((m) => ({ default: m.SignUp })));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Sell = React.lazy(() => import('./pages/Sell').then((m) => ({ default: m.Sell })));
const SellerShop = React.lazy(() => import('./pages/SellerShop').then((m) => ({ default: m.SellerShop })));
const MyProducts = React.lazy(() => import('./pages/MyProducts').then((m) => ({ default: m.MyProducts })));


// Scroll to top helper on route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

export const App = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <ProductsProvider>
          <CartProvider>
            <WishlistProvider>
              <AuctionProvider>
                <FollowProvider>
                  <ReviewsProvider>
                    <SellerProfileProvider>
                      <ScrollToTop />
                      {/* Announcement bar removed per specification */}
                      <Navbar />
                      <main>
                        <React.Suspense fallback={<PageLoadingFallback />}>
                          <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/shop" element={<Shop />} />
                            <Route path="/explore" element={<Shop />} />
                            <Route path="/categories" element={<Categories />} />
                            <Route path="/live-auctions" element={<LiveAuctions />} />
                            <Route path="/auctions" element={<LiveAuctions />} />
                            <Route path="/upcoming-lots" element={<UpcomingLots />} />
                            <Route path="/live/:id" element={<LiveAuctionRoom />} />
                            <Route path="/auction/:id" element={<LiveAuctionRoom />} />
                            <Route path="/meet/:id" element={<LiveAuctionRoom autoOpenMeet={true} />} />
                            <Route path="/product/:id" element={<ProductDetails />} />
                            <Route path="/seller/:sellerId" element={<SellerShop />} />
                            <Route path="/schedule" element={<Schedule />} />
                            <Route path="/account" element={<Account />} />
                            <Route path="/profile" element={<Account />} />
                            <Route path="/wishlist" element={<Wishlist />} />
                            <Route path="/cart" element={<Cart />} />
                            {/* Login and Registration pages kept EXACTLY as they are visually */}
                            <Route path="/signin" element={<SignIn />} />
                            <Route path="/signup" element={<SignUp />} />
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/sell" element={<Sell />} />
                            <Route path="/my-products" element={<MyProducts />} />
                            {/* Fallback */}
                            <Route path="*" element={<Home />} />
                          </Routes>
                        </React.Suspense>
                      </main>
                      <Footer />
                      <ToastContainer />
                    </SellerProfileProvider>
                  </ReviewsProvider>
                </FollowProvider>
              </AuctionProvider>
            </WishlistProvider>
          </CartProvider>
        </ProductsProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
