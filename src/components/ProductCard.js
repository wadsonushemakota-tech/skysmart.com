import React, { useState } from 'react';

const ProductCard = ({ product, onAddToCart, onAddToWishlist, isInWishlist }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  return (
    <div className="product-card">
      <div className="product-image-container">
        <img
          src={product.image}
          alt={product.name}
          onLoad={handleImageLoad}
          style={{ opacity: imageLoaded ? 1 : 0.5 }}
        />
        <div className="product-overlay">
          <button className="quick-view-btn">Quick View</button>
        </div>
      </div>

      <div className="product-info">
        <h3>{product.name}</h3>

        <div className="product-rating">
          <div className="stars">
            {'★'.repeat(Math.floor(product.rating))}
            {product.rating % 1 !== 0 ? '☆' : ''}
          </div>
          <span className="rating-count">({product.reviews} reviews)</span>
        </div>

        <div className="product-price">
          <span className="current-price">${product.price}</span>
          {product.originalPrice && (
            <span className="original-price">${product.originalPrice}</span>
          )}
          {product.originalPrice && (
            <span className="discount-badge">
              -{Math.round((1 - product.price / product.originalPrice) * 100)}%
            </span>
          )}
        </div>

        <div className="product-actions">
          <button
            className="add-to-cart-btn"
            onClick={() => onAddToCart(product)}
          >
            <span className="cart-icon">🛒</span>
            Add to Cart
          </button>

          <button
            className={`wishlist-btn ${isInWishlist ? 'added' : ''}`}
            onClick={() => onAddToWishlist(product)}
          >
            <span className="heart-icon">
              {isInWishlist ? '❤️' : '🤍'}
            </span>
          </button>
        </div>

        {product.tags && product.tags.length > 0 && (
          <div className="product-badges">
            {product.tags.map(tag => (
              <span key={tag} className={`badge ${tag}`}>
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
