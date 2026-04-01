# Sky Smart - React E-Commerce Application

This is a modern e-commerce website built with React.js featuring a fully functional products section with category filtering, shopping cart, and wishlist functionality.

## 🚀 Features

### React Components
- **Product Cards** with hover effects and badges
- **Category Filtering** with dynamic banners
- **Shopping Cart** with persistent storage
- **Wishlist** functionality
- **Responsive Design** for all devices
- **Modern UI/UX** with smooth animations

### Product Features
- ✅ **Dynamic Category Filtering** - Filter by Jordans, Nike, Adidas, Sneakers, Lifestyle
- ✅ **Category Banners** - Custom images and descriptions for each category
- ✅ **Product Ratings** - Star ratings and review counts
- ✅ **Pricing** - Current prices with original prices and discounts
- ✅ **Product Badges** - New, Bestseller, Featured, Limited, etc.
- ✅ **Add to Cart** - Functional cart with quantity tracking
- ✅ **Wishlist** - Heart-shaped buttons with persistent storage
- ✅ **Quick View** - Product preview functionality
- ✅ **Responsive Grid** - Adapts to all screen sizes

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode (with React)
```bash
npm run dev-react
```
This starts the webpack dev server with hot reloading.

### 3. Build for Production
```bash
npm run build
```

### 4. Serve Production Build
```bash
npm run serve
```
This builds the app and serves it on http://localhost:3000

### 5. Backend Server (Optional)
```bash
npm run dev
```
This starts the Node.js backend server on a separate port.

## 📁 Project Structure

```
sky-smart-website/
├── src/
│   ├── components/          # React components
│   │   ├── Header.js        # Navigation header
│   │   ├── ProductCard.js   # Individual product display
│   │   ├── CategoryBanner.js # Category banner images
│   │   ├── Notification.js  # Toast notifications
│   │   └── Footer.js        # Site footer
│   ├── pages/              # Page components
│   │   ├── HomePage.js     # Landing page
│   │   └── ProductsPage.js # Products catalog
│   ├── styles/
│   │   └── main.css        # Global styles
│   ├── App.js              # Main app component
│   └── index.js            # React entry point
├── public/                 # Static assets
├── dist/                   # Production build (generated)
├── products.html           # Legacy products page
├── server.js               # Backend server
└── webpack.config.js       # Build configuration
```

## 🎨 Component Features

### ProductsPage Component
- **State Management**: React hooks for category filtering
- **Data Filtering**: Dynamic product filtering based on categories
- **Banner System**: Category-specific images and descriptions
- **Persistence**: Cart and wishlist data saved to localStorage

### ProductCard Component
- **Hover Effects**: Image zoom and overlay animations
- **Price Display**: Current/original prices with discount badges
- **Rating System**: Star ratings with review counts
- **Action Buttons**: Add to cart and wishlist with visual feedback

### CategoryBanner Component
- **Dynamic Content**: Changes based on selected category
- **Image Loading**: Smooth loading animations
- **Responsive Text**: Adapts to different screen sizes

## 🔧 Configuration

### Webpack Configuration
- **Babel**: ES6+ to ES5 transpilation
- **CSS**: Style-loader and CSS-loader
- **File Loading**: Image and asset handling
- **Dev Server**: Hot reloading and history API fallback

### Category Data
Categories are defined in `ProductsPage.js`:
```javascript
const categories = [
  { id: 'all', name: 'All Products', icon: '🌟' },
  { id: 'jordans', name: 'Jordan Shoes', icon: '🏀' },
  { id: 'nike', name: 'Nike Shoes', icon: '✓' },
  { id: 'adidas', name: 'Adidas', icon: '▲' },
  { id: 'sneakers', name: 'Sneakers', icon: '👟' },
  { id: 'lifestyle', name: 'Lifestyle', icon: '💼' }
];
```

## 🌟 Key Improvements Over Static Version

1. **React State Management**: Proper state handling for cart, wishlist, and filtering
2. **Component Reusability**: Modular components that can be easily maintained
3. **Dynamic Rendering**: Real-time updates without page reloads
4. **Modern JavaScript**: ES6+ features and React hooks
5. **Better Performance**: Virtual DOM and optimized rendering
6. **Type Safety**: Better error handling and data validation
7. **Scalability**: Easy to add new features and components

## 🚀 Usage

### Navigation
- Click category buttons to filter products
- Category banners appear with relevant images
- Cart and wishlist counts update in real-time

### Shopping
- Add products to cart with quantity tracking
- Add/remove items from wishlist
- Persistent data across browser sessions

### Responsive Design
- Mobile-first approach
- Adapts to tablets, desktops, and mobile phones
- Touch-friendly interface

## 🐛 Troubleshooting

### Build Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear webpack cache
rm -rf dist/
npm run build
```

### React Not Loading
- Check browser console for errors
- Ensure webpack dev server is running
- Verify all dependencies are installed

### Images Not Loading
- Check file paths in components
- Ensure images are in the correct directory
- Verify webpack asset loading configuration

## 📱 Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 📞 Support

For issues or questions, please check the browser console for errors and ensure all dependencies are properly installed.

---

**Built with ❤️ using React.js**
