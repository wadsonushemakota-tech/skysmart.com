import React from 'react';

const HomePage = ({ navigateTo }) => {
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

      <section className="about-preview">
        <h2>About Sky Smart</h2>
        <p>At Sky Smart, we bring you the best shoes and clothing collections that blend style, comfort and affordability...</p>
      </section>
    </div>
  );
};

export default HomePage;
