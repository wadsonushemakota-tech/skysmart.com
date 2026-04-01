import React, { useState } from 'react';

const CategoryBanner = ({ category }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  return (
    <div className="category-banner">
      <div className="banner-content">
        <img
          src={category.image}
          alt={category.title}
          className="category-main-image"
          onLoad={handleImageLoad}
          style={{ opacity: imageLoaded ? 1 : 0.5 }}
        />
        <div className="banner-text">
          <h3>{category.title}</h3>
          <p>{category.description}</p>
        </div>
      </div>
    </div>
  );
};

export default CategoryBanner;
