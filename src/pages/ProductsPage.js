import React, { useState, useEffect } from 'react';
import ProductCard from '../components/ProductCard';
import CategoryBanner from '../components/CategoryBanner';
import Notification from '../components/Notification';

const ProductsPage = ({ cart, wishlist, addToCart, addToWishlist }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [notification, setNotification] = useState(null);

  // Product data
  const products = [
    {
      id: 1,
      name: 'Air Jordan 4 Original',
      price: 89.99,
      originalPrice: 120.00,
      image: 'images/j4.jpg',
      category: 'jordans',
      rating: 4.2,
      reviews: 42,
      tags: ['new', 'bestseller'],
      description: 'Classic Air Jordan 4 with premium materials and iconic design.'
    },
    {
      id: 2,
      name: 'Air Max 90P',
      price: 79.99,
      originalPrice: 100.00,
      image: 'images/max.jpg',
      category: 'nike',
      rating: 4.1,
      reviews: 28,
      tags: ['featured'],
      description: 'Revolutionary Air Max technology meets modern style.'
    },
    {
      id: 3,
      name: 'Air Jordan 3',
      price: 94.99,
      originalPrice: 125.00,
      image: 'images/j11.jpg',
      category: 'jordans',
      rating: 4.7,
      reviews: 67,
      tags: ['limited'],
      description: 'Timeless Jordan 3 design with legendary performance.'
    },
    {
      id: 4,
      name: 'Air Force 1 Best Quality',
      price: 69.99,
      originalPrice: 90.00,
      image: 'images/n2.jpg',
      category: 'nike',
      rating: 4.5,
      reviews: 156,
      tags: ['bestseller'],
      description: 'The legendary Air Force 1 in premium quality construction.'
    },
    {
      id: 5,
      name: 'Air Force 1 White',
      price: 74.99,
      originalPrice: 95.00,
      image: 'images/bl.jpg',
      category: 'nike',
      rating: 4.3,
      reviews: 89,
      tags: ['popular'],
      description: 'Clean white Air Force 1 for versatile styling.'
    },
    {
      id: 6,
      name: 'Timberland Boots',
      price: 119.99,
      originalPrice: 150.00,
      image: 'images/timb.jpg',
      category: 'lifestyle',
      rating: 4.0,
      reviews: 34,
      tags: ['premium'],
      description: 'Durable Timberland boots built for any adventure.'
    },
    {
      id: 7,
      name: 'SB Dunk Red',
      price: 84.99,
      originalPrice: 110.00,
      image: 'images/se.jpg',
      category: 'nike',
      rating: 4.4,
      reviews: 78,
      tags: ['trending'],
      description: 'Vibrant red SB Dunk for street style enthusiasts.'
    },
    {
      id: 8,
      name: 'Air Force Plain White',
      price: 72.99,
      originalPrice: 92.00,
      image: 'images/n22.jpg',
      category: 'nike',
      rating: 4.2,
      reviews: 52,
      tags: ['classic'],
      description: 'Minimalist Air Force 1 design in crisp white.'
    }
  ];

  const categories = [
    { id: 'all', name: 'All Products', icon: '🌟' },
    { id: 'jordans', name: 'Jordan Shoes', icon: '🏀' },
    { id: 'nike', name: 'Nike Shoes', icon: '✓' },
    { id: 'lifestyle', name: 'Lifestyle', icon: '💼' }
  ];

  const categoryData = {
    jordans: {
      title: 'Jordan Shoes Collection',
      description: 'Discover the legendary Air Jordan collection with premium quality and iconic designs.',
      image: 'images/jor.jpg'
    },
    nike: {
      title: 'Nike Shoes Collection',
      description: 'Experience innovation and performance with our premium Nike footwear collection.',
      image: 'images/nike.jpg'
    },
    lifestyle: {
      title: 'Lifestyle Collection',
      description: 'Comfortable and stylish footwear perfect for everyday wear and special occasions.',
      image: 'images/lv.jpg'
    }
  };

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(product => product.category === activeCategory);

  const handleCategoryChange = (categoryId) => {
    setActiveCategory(categoryId);
  };

  const handleAddToCart = (product) => {
    addToCart(product);
    showNotification(`${product.name} added to cart!`, 'success');
  };

  const handleAddToWishlist = (product) => {
    const exists = wishlist.find(item => item.id === product.id);
    if (!exists) {
      addToWishlist(product);
      showNotification(`${product.name} added to wishlist! ❤️`, 'success');
    } else {
      showNotification(`${product.name} is already in your wishlist!`, 'info');
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="products-page">
      {/* Hero Section */}
      <section className="products-hero">
        <h1>Our Premium Collection</h1>
        <p>Discover the latest trends in sneakers and footwear</p>
      </section>

      {/* Category Filter */}
      <section className="category-section">
        <h2>Shop By Category</h2>
        <div className="category-filters">
          {categories.map(category => (
            <button
              key={category.id}
              className={`filter-btn ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryChange(category.id)}
            >
              <span className="filter-icon">{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>

        {/* Category Banner */}
        {activeCategory !== 'all' && categoryData[activeCategory] && (
          <CategoryBanner category={categoryData[activeCategory]} />
        )}
      </section>

      {/* Products Grid */}
      <section className="products-section">
        <div className="products-grid">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
              onAddToWishlist={handleAddToWishlist}
              isInWishlist={wishlist.some(item => item.id === product.id)}
            />
          ))}
        </div>
      </section>

      {/* Notification */}
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

export default ProductsPage;
