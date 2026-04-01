import React from 'react';

const Header = ({ cart, wishlist, navigateTo, currentPage, onOpenCart, onOpenWishlist }) => {
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const wishlistCount = wishlist.length;

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="logo">
          <h2 onClick={() => navigateTo('home')} style={{ cursor: 'pointer' }}>
            Sky Smart
          </h2>
        </div>

        <nav className="menu menu-desktop">
          <ul>
            <li>
              <a
                href="#home"
                className={currentPage === 'home' ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('home');
                }}
              >
                HOME
              </a>
            </li>
            <li>
              <a href="#about">ABOUT</a>
            </li>
            <li>
              <a
                href="#products"
                className={currentPage === 'products' ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('products');
                }}
              >
                PRODUCTS
              </a>
            </li>
            <li>
              <a href="#contact">CONTACT</a>
            </li>
          </ul>
        </nav>

        <div className="navbar-icons">
          <button
            type="button"
            className="wishlist-icon icon-btn"
            onClick={() => (onOpenWishlist ? onOpenWishlist() : navigateTo('wishlist'))}
            aria-label={`Saved items, ${wishlistCount} items`}
          >
            <span className="wishlist-icon-text">❤️</span>
            {wishlistCount > 0 && <span className="wishlist-count">{wishlistCount}</span>}
          </button>

          <button
            type="button"
            className="cart-icon icon-btn"
            onClick={() => onOpenCart && onOpenCart()}
            aria-label={`Shopping bag, ${cartCount} items`}
          >
            <span className="cart-icon-text">🛒</span>
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
