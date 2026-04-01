import React from 'react';
import ProductCard from '../components/ProductCard';
import Notification from '../components/Notification';

const WishlistPage = ({ wishlist, addToCart, removeFromWishlist, navigateTo }) => {
  const [notification, setNotification] = React.useState(null);

  const showNote = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 2500);
  };

  return (
    <div className="wishlist-page">
      <section className="wishlist-hero">
        <h1>Saved items</h1>
        <p>Styles you love—move them to your bag when you are ready.</p>
      </section>

      {wishlist.length === 0 ? (
        <div className="wishlist-empty">
          <p>No saved items yet.</p>
          <button type="button" className="cta-button" onClick={() => navigateTo('products')}>
            Browse shop
          </button>
        </div>
      ) : (
        <section className="products-section">
          <div className="products-grid">
            {wishlist.map((product) => (
              <div key={product.id} className="wishlist-card-wrap">
                <ProductCard
                  product={product}
                  onAddToCart={(p) => {
                    addToCart(p);
                    showNote(`${p.name} added to bag`, 'success');
                  }}
                  onAddToWishlist={() => {}}
                  isInWishlist
                />
                <button
                  type="button"
                  className="wishlist-remove-btn"
                  onClick={() => {
                    removeFromWishlist(product.id);
                    showNote('Removed from saved', 'info');
                  }}
                >
                  Remove from saved
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
};

export default WishlistPage;
