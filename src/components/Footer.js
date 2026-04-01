import React from 'react';

const Footer = () => {
  return (
    <footer>
      <div className="footer-content">
        <div className="footer-section">
          <h3>Sky Smart</h3>
          <p>Your ultimate destination for fashion and footwear! We bring you the latest trends in shoes and clothing with style, comfort, and affordability.</p>
        </div>

        <div className="footer-section">
          <h3>Quick Links</h3>
          <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#products">Products</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h3>Contact Info</h3>
          <p>📧 wadsonushemakota@gmail.com</p>
          <p>📞 +263 77 707 6575</p>
          <p>📍 Bulawayo, Zimbabwe</p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2025 Sky Smart. All Rights Reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
