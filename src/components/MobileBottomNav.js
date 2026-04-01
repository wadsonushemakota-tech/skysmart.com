import React from 'react';

const MobileBottomNav = ({ currentPage, navigateTo, cartCount, onOpenBag }) => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      <button
        type="button"
        className={`mbn-item ${currentPage === 'home' ? 'active' : ''}`}
        onClick={() => navigateTo('home')}
      >
        <span className="mbn-icon" aria-hidden>⌂</span>
        <span className="mbn-label">Home</span>
      </button>
      <button
        type="button"
        className={`mbn-item ${currentPage === 'products' ? 'active' : ''}`}
        onClick={() => navigateTo('products')}
      >
        <span className="mbn-icon" aria-hidden>☰</span>
        <span className="mbn-label">Shop</span>
      </button>
      <button
        type="button"
        className={`mbn-item ${currentPage === 'wishlist' ? 'active' : ''}`}
        onClick={() => navigateTo('wishlist')}
      >
        <span className="mbn-icon" aria-hidden>♡</span>
        <span className="mbn-label">Saved</span>
      </button>
      <button type="button" className="mbn-item" onClick={onOpenBag}>
        <span className="mbn-icon mbn-bag-wrap" aria-hidden>
          🛍
          {cartCount > 0 && <span className="mbn-badge">{cartCount > 99 ? '99+' : cartCount}</span>}
        </span>
        <span className="mbn-label">Bag</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
