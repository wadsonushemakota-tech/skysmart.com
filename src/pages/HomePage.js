import React, { useState, useEffect } from 'react';
import ProductCard from '../components/ProductCard';

const API_BASE = String(process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

const HomePage = ({ navigateTo, cart, wishlist, addToCart, addToWishlist }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sample products as fallback
  const fallbackProducts = [
    { id: 1, name: "Air Max Sneakers", price: 129.99, originalPrice: 189.99, image: "images/nik.jpg", rating: 4.8, reviews: 245, tags: ["new"] },
    { id: 2, name: "Jordan Retro", price: 189.99, originalPrice: 249.99, image: "images/jord.jpg", rating: 4.9, reviews: 312, tags: ["featured"] },
    { id: 3, name: "Nike Dunk Low", price: 159.99, originalPrice: 209.99, image: "images/nike.jpg", rating: 4.7, reviews: 187, tags: ["new"] },
    { id: 4, name: "Yeezy Boost", price: 219.99, originalPrice: 299.99, image: "images/yez.jpeg", rating: 4.9, reviews: 423, tags: ["best"] },
    { id: 5, name: "Classic Slides", price: 49.99, originalPrice: 69.99, image: "images/slides.jpg", rating: 4.5, reviews: 156, tags: [] },
    { id: 6, name: "Running Shoes Pro", price: 139.99, originalPrice: 189.99, image: "images/21.jpg", rating: 4.6, reviews: 189, tags: [] },
    { id: 7, name: "Casual Sneakers", price: 89.99, originalPrice: 119.99, image: "images/1.jpg", rating: 4.4, reviews: 134, tags: [] },
    { id: 8, name: "Urban Streetwear", price: 109.99, originalPrice: 149.99, image: "images/3.jpg", rating: 4.7, reviews: 178, tags: ["new"] }
  ];

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch(apiUrl('/api/products'));
        if (res.ok) {
          const data = await res.json();
          if (data.products && data.products.length > 0) {
            setProducts(data.products.map(p => ({
              id: p.id,
              name: p.name,
              price: p.price,
              originalPrice: p.price * 1.3,
              image: p.images && p.images[0] ? p.images[0] : "images/nik.jpg",
              rating: 4.5,
              reviews: Math.floor(Math.random() * 300) + 100,
              tags: []
            })));
          } else {
            setProducts(fallbackProducts);
          }
        } else {
          setProducts(fallbackProducts);
        }
      } catch (err) {
        console.log("Using fallback products");
        setProducts(fallbackProducts);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-content">
          <h1>Style Starts Here <br />
            <span>Clothes and Fashion</span><br />
            That Fits Your Lifestyle
          </h1>
          <p>Welcome to your ultimate destination for fashion and footwear!
            We bring you the latest trends in shoes and clothing. Whether you are looking for
            everyday comfort, bold street wear or classy outfits for special occasions,
            we have got you covered.</p>
          <button
            className="cta-button"
            onClick={() => navigateTo('products')}
          >
            PURCHASE
          </button>
        </div>
      </section>

      <section className="featured-products-section">
        <h2 className="section-title">Featured Products</h2>
        {loading ? (
          <div className="loading-container">
            <p>Loading products...</p>
          </div>
        ) : (
          <div className="featured-products-grid">
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={addToCart}
                onAddToWishlist={addToWishlist}
                isInWishlist={wishlist.some(w => w.id === product.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="about-preview">
        <h2>About Sky Smart</h2>
        <p>At Sky Smart, we bring you the best shoes and clothing collections that blend style, comfort and affordability...</p>
      </section>
    </div>
  );
};

export default HomePage;
