import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import WishlistPage from './pages/WishlistPage';
import Footer from './components/Footer';
import CartDrawer from './components/CartDrawer';
import MobileBottomNav from './components/MobileBottomNav';

const API_BASE = String(process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Load cart and wishlist from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('skySmartCart');
    const savedWishlist = localStorage.getItem('skySmartWishlist');

    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
    if (savedWishlist) {
      setWishlist(JSON.parse(savedWishlist));
    }
  }, []);

  // Save cart and wishlist to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('skySmartCart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('skySmartWishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  const navigateTo = (page) => {
    setCurrentPage(page);
    window.history.pushState(null, '', `#${page}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      setCheckoutNotice('Thanks! Your payment was received. You will get a confirmation from the payment provider.');
      setCart([]);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#home'}`);
    } else if (checkout === 'cancel') {
      setCheckoutNotice('Checkout was cancelled. Your bag is unchanged.');
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#home'}`);
    }
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '') || 'home';
      setCurrentPage(hash);
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial page based on URL hash
    const initialHash = window.location.hash.replace('#', '') || 'home';
    setCurrentPage(initialHash);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const addToCart = (product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const addToWishlist = (product) => {
    setWishlist(prevWishlist => {
      const exists = prevWishlist.find(item => item.id === product.id);
      if (!exists) {
        return [...prevWishlist, product];
      }
      return prevWishlist;
    });
  };

  const removeFromWishlist = (productId) => {
    setWishlist((prev) => prev.filter((p) => p.id !== productId));
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity < 1) {
      setCart((prev) => prev.filter((item) => item.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const startSecureCheckout = useCallback(
    async (customerEmail) => {
      setPaymentError(null);
      if (!cart.length) {
        setPaymentError('Your bag is empty.');
        return;
      }
      const email = (customerEmail || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setPaymentError('Please enter a valid email for your receipt.');
        return;
      }
      setPaymentLoading(true);
      try {
        const successUrl = `${window.location.origin}${window.location.pathname}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${window.location.origin}${window.location.pathname}?checkout=cancel`;
        const res = await fetch(apiUrl('/api/payments/create-checkout-session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerEmail: email,
            items: cart.map(({ id, name, price, quantity }) => ({
              id,
              name,
              price: Number(price),
              quantity: Number(quantity),
            })),
            successUrl,
            cancelUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          setPaymentError(data.message || data.error || 'Could not start checkout.');
          return;
        }
        window.location.assign(data.url);
      } catch (e) {
        setPaymentError(e.message || 'Network error. Is the server running?');
      } finally {
        setPaymentLoading(false);
      }
    },
    [cart]
  );

  const renderPage = () => {
    switch (currentPage) {
      case 'products':
        return (
          <ProductsPage
            cart={cart}
            wishlist={wishlist}
            addToCart={addToCart}
            addToWishlist={addToWishlist}
          />
        );
      case 'wishlist':
        return (
          <WishlistPage
            wishlist={wishlist}
            addToCart={addToCart}
            removeFromWishlist={removeFromWishlist}
            navigateTo={navigateTo}
          />
        );
      case 'home':
      default:
        return <HomePage navigateTo={navigateTo} />;
    }
  };

  return (
    <div className="App app-mobile-shell">
      {checkoutNotice && (
        <div className="checkout-banner" role="status">
          <span>{checkoutNotice}</span>
          <button type="button" className="checkout-banner-dismiss" onClick={() => setCheckoutNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <Header
        cart={cart}
        wishlist={wishlist}
        navigateTo={navigateTo}
        currentPage={currentPage}
        onOpenCart={() => setCartOpen(true)}
        onOpenWishlist={() => navigateTo('wishlist')}
      />
      <main className="main-with-bottom-nav">
        {renderPage()}
      </main>
      <Footer />
      <MobileBottomNav
        currentPage={currentPage}
        navigateTo={navigateTo}
        cartCount={cart.reduce((n, i) => n + i.quantity, 0)}
        onOpenBag={() => setCartOpen(true)}
      />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        updateQuantity={updateCartQuantity}
        removeFromCart={removeFromCart}
        onPay={startSecureCheckout}
        loading={paymentLoading}
        errorMessage={paymentError}
        onClearError={() => setPaymentError(null)}
      />
    </div>
  );
}

export default App;
