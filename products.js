// Products Page JavaScript - Simplified for static HTML

function skySmartFetch(path, options) {
    const url =
        typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(path) : path;
    return fetch(url, options);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    initializeProducts();
});

// Setup event listeners
function setupEventListeners() {
    // Check if on products.html by looking for the grid
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    // Category filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.getAttribute('onclick').match(/'([^']+)'/)[1];
            filterProducts(category);

            // Update active button styling
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    // Add to cart buttons
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const productName = this.getAttribute('onclick').match(/'([^']+)'/)[1];
            const price = parseFloat(this.getAttribute('onclick').match(/(\d+\.?\d*)/)[0]);
            addToCart(productName, price);
        });
    });

    // Wishlist buttons
    document.querySelectorAll('.wishlist-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const productName = this.getAttribute('onclick').match(/'([^']+)'/)[1];
            addToWishlist(productName);
        });
    });

    // Quick view buttons
    document.querySelectorAll('.quick-view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            openQuickView(modalId);
        });
    });
}

const staticProductsFallback = [
    { id: 1, name: 'Jordan 4 Original', price: 25, category: 'jordans', images: ['images/j4.jpg'], colors: ['Blue', 'Red'], description: 'Classic Air Jordan 4' },
    { id: 2, name: 'Air Force 1 White', price: 15, category: 'nike', images: ['images/bl.jpg'], colors: ['White', 'Black'], description: 'Iconic AF1' },
    { id: 3, name: 'Air Jordan 11', price: 25, category: 'jordans', images: ['images/j11.jpg'], colors: ['Concord', 'Bred'], description: 'Elegant AJ11' },
    { id: 4, name: 'Air Max 90P', price: 22, category: 'nike', images: ['images/max.jpg'], colors: ['Grey'], description: 'Performance Max 90' }
];

// Initialize products
function initializeProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    // Show loading state
    productsGrid.innerHTML = '<div class="loading-products">Loading collection...</div>';

    // Set "All Products" as active by default
    const allProductsBtn = document.querySelector('.filter-btn[onclick*="all"]');
    if (allProductsBtn) allProductsBtn.classList.add('active');

    // Initialize counts and icons
    updateCartCount();
    updateWishlistCount();
    addCartWishlistIcons();

    // Fetch from API or use static fallback
    skySmartFetch('/api/products')
        .then(res => res.json())
        .then(data => {
            if (data && data.success && data.products && data.products.length > 0) {
                allProducts = data.products;
                displayProducts(allProducts);
            } else {
                console.warn('API returned no products or success=false, using fallback');
                allProducts = staticProductsFallback;
                displayProducts(allProducts);
            }
            setupLegacyEvents();
        })
        .catch(err => {
            console.error('Fetch error:', err);
            allProducts = staticProductsFallback;
            displayProducts(allProducts);
            setupLegacyEvents();
        });

    console.log('Products page initialized');
}

// Removed duplicate loadProducts and DOMContentLoaded logic

// Cart management functions
function viewCart() {
    if (productsCart.length === 0) {
        showNotification('Your cart is empty!', 'info');
        return;
    }

    let cartSummary = 'Your Cart:\n';
    let total = 0;

    productsCart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        cartSummary += `• ${item.name} (x${item.quantity}) - $${itemTotal.toFixed(2)}\n`;
    });

    cartSummary += `\nTotal: $${total.toFixed(2)}`;
    alert(cartSummary);
}

function clearCart() {
    if (productsCart.length === 0) {
        showNotification('Your cart is already empty!', 'info');
        return;
    }

    if (confirm('Are you sure you want to clear your cart?')) {
        productsCart = [];
        localStorage.setItem('productsCart', JSON.stringify(productsCart));
        updateCartCount();
        showNotification('Cart cleared!', 'success');
    }
}

function clearWishlist() {
    if (productsWishlist.length === 0) {
        showNotification('Your wishlist is already empty!', 'info');
        return;
    }

    if (confirm('Are you sure you want to clear your wishlist?')) {
        productsWishlist = [];
        localStorage.setItem('productsWishlist', JSON.stringify(productsWishlist));
        updateWishlistCount();

        // Reset all wishlist buttons
        document.querySelectorAll('.wishlist-btn').forEach(btn => {
            btn.classList.remove('added');
            btn.innerHTML = '<span class="heart-icon">🤍</span>';
            btn.style.background = '';
            btn.style.color = '';
        });

        showNotification('Wishlist cleared!', 'success');
    }
}

// Add cart and wishlist icons to navbar if they don't exist
function addCartWishlistIcons() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    // Check if cart icon already exists
    if (!document.querySelector('.cart-icon')) {
        const cartIcon = document.createElement('div');
        cartIcon.className = 'cart-icon';
        cartIcon.innerHTML = `
            <a href="#" onclick="viewCart()" title="View Cart">
                <span class="cart-icon-text">🛒</span>
                <span class="cart-count" style="display: none;">0</span>
            </a>
        `;
        navbar.appendChild(cartIcon);
    }

    // Check if wishlist icon already exists
    if (!document.querySelector('.wishlist-icon')) {
        const wishlistIcon = document.createElement('div');
        wishlistIcon.className = 'wishlist-icon';
        wishlistIcon.innerHTML = `
            <a href="#" onclick="viewWishlist()" title="View Wishlist">
                <span class="wishlist-icon-text">❤️</span>
                <span class="wishlist-count" style="display: none;">0</span>
            </a>
        `;
        navbar.appendChild(wishlistIcon);
    }
}

function viewWishlist() {
    if (productsWishlist.length === 0) {
        showNotification('Your wishlist is empty!', 'info');
        return;
    }

    let wishlistSummary = 'Your Wishlist:\n';
    productsWishlist.forEach(item => {
        wishlistSummary += `• ${item.name}\n`;
    });

    alert(wishlistSummary);
}

// Filter products by category
function filterProducts(category) {
    // If we have products loaded from DB, use that logic
    if (allProducts.length > 0) {
        filterProductsByCategory(category);
        return;
    }

    const products = document.querySelectorAll('.product-card');
    const categoryBanner = document.getElementById('category-banner');
    const categoryImage = document.getElementById('category-image');
    const categoryTitle = document.getElementById('category-title');
    const categoryDescription = document.getElementById('category-description');

    let visibleCount = 0;

    // Show/hide category banner
    if (category === 'all') {
        categoryBanner.style.opacity = '0';
        setTimeout(() => {
            categoryBanner.style.display = 'none';
        }, 300);
    } else {
        // Set category image and info based on selected category
        const categoryData = getCategoryData(category);
        categoryImage.src = categoryData.image;
        categoryImage.alt = categoryData.title;
        categoryTitle.textContent = categoryData.title;
        categoryDescription.textContent = categoryData.description;

        // Show banner with animation
        categoryBanner.style.display = 'block';
        categoryBanner.style.opacity = '0';
        setTimeout(() => {
            categoryBanner.style.opacity = '1';
            categoryBanner.style.transition = 'opacity 0.3s ease';
        }, 50);
    }

    products.forEach((product, index) => {
        const productCategories = product.getAttribute('data-category');

        if (category === 'all' || productCategories.includes(category)) {
            // Stagger animation for smooth reveal
            setTimeout(() => {
                product.style.display = 'block';
                product.style.opacity = '0';
                product.style.transform = 'translateY(20px)';

                setTimeout(() => {
                    product.style.opacity = '1';
                    product.style.transform = 'translateY(0)';
                    product.style.transition = 'all 0.3s ease';
                }, 50);
            }, index * 50);

            visibleCount++;
        } else {
            product.style.display = 'none';
            product.style.opacity = '0';
        }
    });

    // Update URL hash for bookmarking (optional)
    if (category !== 'all') {
        window.location.hash = category;
    } else {
        window.location.hash = '';
    }

    // Update page title or show count (optional)
    const pageTitle = category === 'all' ? 'All Products' : getCategoryData(category).title;
    document.title = `${pageTitle} - Sky Smart`;

    console.log(`Showing ${visibleCount} products in ${pageTitle} category`);
}

// Get category data including image and description
function getCategoryData(category) {
    const categoryData = {
        jordans: {
            title: 'Jordan Shoes Collection',
            description: 'Discover the legendary Air Jordan collection with premium quality and iconic designs.',
            image: 'images/j4.jpg'
        },
        nike: {
            title: 'Nike Shoes Collection',
            description: 'Experience innovation and performance with our premium Nike footwear collection.',
            image: 'images/n2.jpg'
        },
        adidas: {
            title: 'Adidas Shoes Collection',
            description: 'Step into style and comfort with our curated Adidas footwear selection.',
            image: 'images/se.jpg'
        },
        sneakers: {
            title: 'Premium Sneakers',
            description: 'Explore our handpicked collection of the finest sneakers from top brands.',
            image: 'images/se.jpg'
        },
        lifestyle: {
            title: 'Lifestyle Collection',
            description: 'Comfortable and stylish footwear perfect for everyday wear and special occasions.',
            image: 'images/lv.jpg'
        },
        schoolwear: {
            title: 'School Wear',
            description: 'Durable and comfortable wear for everyday school life.',
            image: 'images/lv.jpg'
        }
    };

    return categoryData[category] || {
        title: 'Category',
        description: 'Premium footwear collection',
        image: 'images/j4.jpg'
    };
}

// Unified cart and wishlist shared with home page
let productsCart = JSON.parse(localStorage.getItem('skySmartCart') || '[]');
let productsWishlist = JSON.parse(localStorage.getItem('skySmartWishlist') || '[]');

// Add to cart functionality
function addToCart(productName, price, button = null) {
    // Check if product already in cart
    const existingItem = productsCart.find(item => item.name === productName);

    if (existingItem) {
        existingItem.quantity += 1;
        showNotification(`${productName} quantity updated in cart!`, 'success');
    } else {
        productsCart.push({
            name: productName,
            price: parseFloat(price),
            quantity: 1,
            addedAt: new Date().toISOString()
        });
        showNotification(`${productName} added to cart!`, 'success');
    }

    // Save to localStorage
    localStorage.setItem('skySmartCart', JSON.stringify(productsCart));

    // Update cart count
    updateCartCount();

    // Change button temporarily
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<span class="cart-icon">✓</span> Added!';
        button.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
        button.disabled = true;

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.background = '';
            button.disabled = false;
        }, 2000);
    }

    console.log('Cart items:', productsCart);
}

// Add to wishlist functionality
function addToWishlist(productName) {
    // Check if product already in wishlist
    const existingItem = productsWishlist.find(item => item.name === productName);

    if (existingItem) {
        showNotification(`${productName} is already in your wishlist!`, 'info');
        return;
    }

    productsWishlist.push({
        name: productName,
        addedAt: new Date().toISOString()
    });

    // Save to localStorage
    localStorage.setItem('skySmartWishlist', JSON.stringify(productsWishlist));

    // Show success message
    showNotification(`${productName} added to wishlist! ❤️`, 'success');

    // Change button temporarily and permanently (if triggered by a button click)
    let button = null;
    try {
        button = (typeof event !== 'undefined' && event && event.target) ? event.target.closest('.wishlist-btn') : null;
    } catch (e) { button = null; }
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<span class="heart-icon">💖</span> Added!';
        button.style.background = '#e74c3c';
        button.style.color = 'white';
        button.classList.add('added');

        setTimeout(() => {
            button.innerHTML = '<span class="heart-icon">❤️</span> Added';
            // Keep the added state
        }, 2000);
    }

    console.log('Wishlist items:', productsWishlist);
}

// Quick view functionality
const productsModalData = {
    'jordan4': { name: 'Jordan 4 Original', price: 25, image: 'images/j4.jpg' },
    'airmax90p': { name: 'Air Max 90P', price: 22, image: 'images/max.jpg' },
    'jordan3': { name: 'Air Jordan 3 Original', price: 27, image: 'images/j11.jpg' },
    'af1-best': { name: 'Air Force 1 Best Quality', price: 15, image: 'images/n2.jpg' },
    'af1-white': { name: 'Air Force 1 White', price: 15, image: 'images/bl.jpg' },
    'timberland': { name: 'Timberland Boots', price: 30, image: 'images/timb.jpg' },
    'sb-dunk-red': { name: 'SB Dunk Red', price: 15, image: 'images/se.jpg' },
    'af1-plain-white': { name: 'Air Force Plain White', price: 15, image: 'images/n22.jpg' },
    'school-wear': { name: 'School Wear Pack', price: 18, image: 'images/lv.jpg' }
};

let currentZoom = 1;
let selectedSize = null;

function openQuickView(modalId) {
    const product = productsModalData[modalId];
    if (!product) {
        showNotification('Product details not found', 'error');
        return;
    }

    const modal = document.getElementById('product-modal');
    const modalImage = document.getElementById('modal-image');
    const modalTitle = document.getElementById('modal-title');
    const modalProductName = document.getElementById('modal-product-name');
    const modalPrice = document.getElementById('modal-price');
    const modalAddToCart = document.getElementById('modal-add-to-cart');
    const modalWishlist = document.getElementById('modal-wishlist');

    modalImage.src = product.image;
    modalImage.alt = product.name;
    modalTitle.textContent = product.name;
    modalProductName.textContent = product.name;
    modalPrice.textContent = `Sale $${product.price}`;

    currentZoom = 1;
    selectedSize = null;
    modalImage.style.transform = 'scale(1)';

    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.addEventListener('click', function() {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedSize = this.textContent.trim();
        });
    });

    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const resetZoom = document.getElementById('reset-zoom');
    if (zoomIn && zoomOut && resetZoom) {
        zoomIn.onclick = function() {
            currentZoom = Math.min(currentZoom + 0.1, 2);
            modalImage.style.transform = `scale(${currentZoom})`;
        };
        zoomOut.onclick = function() {
            currentZoom = Math.max(currentZoom - 0.1, 0.8);
            modalImage.style.transform = `scale(${currentZoom})`;
        };
        resetZoom.onclick = function() {
            currentZoom = 1;
            modalImage.style.transform = 'scale(1)';
        };
    }

    modalAddToCart.onclick = function() {
        if (!selectedSize) {
            alert('Please select a size first!');
            return;
        }
        addToCart(product.name, product.price);
        modal.style.display = 'none';
    };

    modalWishlist.onclick = function() {
        addToWishlist(product.name);
        updateModalWishlistButton(product.name);
    };

    modal.style.display = 'flex';
}

function updateModalWishlistButton(productName) {
    const modalWishlist = document.getElementById('modal-wishlist');
    if (!modalWishlist) return;
    const exists = productsWishlist.some(item => item.name === productName);
    if (exists) {
        modalWishlist.classList.add('added');
    } else {
        modalWishlist.classList.remove('added');
    }
}

// Close modal events
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('product-modal');
    const closeBtn = document.getElementById('close-product-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Open modal on image click
    document.querySelectorAll('.product-image-container img').forEach(img => {
        img.addEventListener('click', function() {
            const id = this.getAttribute('data-modal');
            if (id) openQuickView(id);
        });
    });

    const openCheckout = document.getElementById('open-checkout');
    const checkoutModal = document.getElementById('checkout-modal');
    const closeCheckout = document.getElementById('close-checkout');
    const optionBank = document.getElementById('option-bank');
    const optionEco = document.getElementById('option-ecocash');
    const bankDetails = document.getElementById('bank-details');
    const ecoDetails = document.getElementById('ecocash-details');
    const checkoutTotal = document.getElementById('checkout-total');
    const confirmPayment = document.getElementById('confirm-payment');
    const selectedLabel = document.getElementById('selected-method-label');
    const copyEco = document.getElementById('copy-ecocash');
    const instructions = document.getElementById('checkout-instructions');

    let selectedMethod = null;

    function getCartTotal() {
        return productsCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    function formatCurrency(n) {
        return `$${n.toFixed(2)}`;
    }

    function updateCheckoutUI() {
        const total = getCartTotal();
        checkoutTotal.textContent = `Total: ${formatCurrency(total)}`;
        selectedLabel.textContent = selectedMethod ? `Pay with ${selectedMethod === 'bank' ? 'Bank' : 'EcoCash'}` : 'Select a payment method';
    }

    if (openCheckout) {
        openCheckout.addEventListener('click', function() {
            updateCheckoutUI();
            checkoutModal.style.display = 'flex';
        });
    }
    if (closeCheckout) {
        closeCheckout.addEventListener('click', function() {
            checkoutModal.style.display = 'none';
        });
    }
    window.addEventListener('click', function(e) {
        if (e.target === checkoutModal) {
            checkoutModal.style.display = 'none';
        }
    });

    function selectMethod(method) {
        selectedMethod = method;
        optionBank.classList.toggle('active', method === 'bank');
        optionEco.classList.toggle('active', method === 'ecocash');
        bankDetails.style.display = method === 'bank' ? 'block' : 'none';
        ecoDetails.style.display = method === 'ecocash' ? 'block' : 'none';
        if (instructions) { instructions.style.display = 'none'; instructions.innerHTML = ''; }
        updateCheckoutUI();
    }

    if (optionBank) {
        optionBank.addEventListener('click', function() { selectMethod('bank'); });
    }
    if (optionEco) {
        optionEco.addEventListener('click', function() { selectMethod('ecocash'); });
    }

    if (copyEco) {
        copyEco.addEventListener('click', function() {
            navigator.clipboard.writeText('0777076575').then(() => {
                showNotification('EcoCash number copied!', 'success');
            });
        });
    }

    if (confirmPayment) {
        confirmPayment.addEventListener('click', function() {
            if (!selectedMethod) {
                selectedLabel.textContent = 'Please select a payment method';
                if (instructions) { instructions.style.display = 'none'; instructions.innerHTML = ''; }
                return;
            }
            const total = formatCurrency(getCartTotal());
            if (instructions) {
                instructions.style.display = 'block';
                if (selectedMethod === 'ecocash') {
                    instructions.innerHTML = `
                        <h4>EcoCash Payment</h4>
                        <p>Amount: <strong>${total}</strong></p>
                        <p>Number: <strong>0777076575</strong></p>
                        <p>Copy the number and pay via your EcoCash app.</p>
                        <hr />
                        <p>After payment, please send proof of payment and your ordered products to <strong>wadsonushemakota@gmail.com</strong>.</p>
                        <p>For queries, call <strong>0777076575</strong>.</p>
                    `;
                } else {
                    instructions.innerHTML = `
                        <h4>Bank Transfer</h4>
                        <p>Amount: <strong>${total}</strong></p>
                        <p>Account Name: <strong>Wadson Ushemakota</strong></p>
                        <p>Bank: <strong>BancABC</strong></p>
                        <p>Branch Code: <strong>K53</strong></p>
                        <p>ZWG Account: <strong>92351443311235</strong></p>
                        <p>USD Account: <strong>92351448402134</strong></p>
                        <p>Make the transfer and keep your reference.</p>
                        <hr />
                        <p>After payment, please send proof of payment and your ordered products to <strong>wadsonushemakota@gmail.com</strong>.</p>
                        <p>For queries, call <strong>0777076575</strong>.</p>
                    `;
                }
            }
        });
    }
});

// Update cart count (integrate with main site if needed)
function updateCartCount() {
    const totalItems = productsCart.reduce((total, item) => total + item.quantity, 0);

    // Update cart count display (you can add a cart icon counter to the navbar)
    const cartCountElement = document.querySelector('.cart-count');
    if (cartCountElement) {
        cartCountElement.textContent = totalItems;
        cartCountElement.style.display = totalItems > 0 ? 'inline-block' : 'none';
    }

    console.log('Cart updated:', totalItems, 'items');
}

// Update wishlist count
function updateWishlistCount() {
    const totalItems = productsWishlist.length;

    // Update wishlist count display (you can add a wishlist icon counter to the navbar)
    const wishlistCountElement = document.querySelector('.wishlist-count');
    if (wishlistCountElement) {
        wishlistCountElement.textContent = totalItems;
        wishlistCountElement.style.display = totalItems > 0 ? 'inline-block' : 'none';
    }

    console.log('Wishlist updated:', totalItems, 'items');
}

// Initialize cart and wishlist buttons state
function initializeButtonsState() {
    // Mark wishlist buttons as added if items are in wishlist
    productsWishlist.forEach(item => {
        const buttons = document.querySelectorAll('.wishlist-btn');
        buttons.forEach(button => {
            const onclickAttr = button.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(item.name)) {
                button.classList.add('added');
                button.innerHTML = '<span class="heart-icon">❤️</span> Added';
                button.style.background = '#e74c3c';
                button.style.color = 'white';
            }
        });
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <div class="notification-content ${type}">
            ${message}
        </div>
    `;

    // Add inline styles for notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
    `;

    const notificationContent = notification.querySelector('.notification-content');
    notificationContent.style.cssText = `
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-family: 'Segoe UI', sans-serif;
        font-weight: 500;
        font-size: 14px;
        max-width: 300px;
    `;

    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Removed duplicate filterProducts targeting legacy markup

let allProducts = [];
let currentCategory = 'all';

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initializeProducts();
});

// Display products in the grid
function displayProducts(products) {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;
    
    productsGrid.innerHTML = '';
    
    if (products.length === 0) {
        productsGrid.innerHTML = '<div class="no-products">No products found.</div>';
        return;
    }
    
    products.forEach(product => {
        const productCard = createProductCard(product);
        productsGrid.appendChild(productCard);
    });
    
    addProductEventListeners();
}

// Create product card element
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.category = product.category ? product.category.toLowerCase().replace(/\s+/g, '-') : 'all';
    
    const image = getProductImage(product);
    const price = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
    const originalPrice = (price * 1.25).toFixed(2); // Mock discount
    
    card.innerHTML = `
        <div class="product-image-container">
            <img src="${image}" alt="${product.name}" data-product-id="${product.id}" class="main-product-image" onerror="this.src='https://via.placeholder.com/300x300?text=Sky+Smart+Shoe'">
            <div class="product-overlay">
                <button class="quick-view-btn" data-product-id="${product.id}">Quick View</button>
            </div>
        </div>
        <div class="product-info">
            <h3>${product.name}</h3>
            <div class="product-rating">
                <span class="stars">★★★★★</span>
                <span class="rating-count">(24 reviews)</span>
            </div>
            <div class="product-price">
                <span class="current-price">$${price}</span>
                <span class="original-price">$${originalPrice}</span>
                <span class="discount-badge">-20%</span>
            </div>
            
            <div class="product-options">
                <div class="color-selection" data-product-id="${product.id}">
                    ${product.colors ? product.colors.map((color, index) => `
                        <span class="color-option ${index === 0 ? 'selected' : ''}" 
                              data-color="${color}" 
                              style="background-color: ${getColorValue(color)}" 
                              title="${color}"></span>
                    `).join('') : ''}
                </div>
            </div>

            <div class="product-actions">
                <button class="add-to-cart-btn btn-add-cart" data-product-id="${product.id}">
                    <span class="cart-icon">🛒</span>
                    Add to Cart
                </button>
                <button class="wishlist-btn btn-wishlist" data-product-id="${product.id}">
                    <span class="heart-icon">❤️</span>
                </button>
            </div>
            
            <div class="product-gallery-section" id="gallery-${product.id}" style="display: none;">
                <div class="gallery-grid">
                    ${product.images && product.images.length > 1 ? product.images.map(img => `
                        <div class="gallery-item" data-product-id="${product.id}" data-image="${img}" data-color="${(product.colors && product.colors[product.images.indexOf(img)]) || 'Default'}">
                            <img src="${img}" alt="Colorway" onerror="this.src='https://via.placeholder.com/100x100?text=No+Img'">
                        </div>
                    `).join('') : ''}
                </div>
            </div>
            
            <div class="gallery-toggle">
                ${product.images && product.images.length > 1 ? `<button class="view-gallery-btn" data-product-id="${product.id}">📷 View Gallery</button>` : ''}
            </div>

            <div class="product-badges">
                ${product.id % 2 === 0 ? '<span class="badge new">New Arrival</span>' : ''}
                ${product.price < 20 ? '<span class="badge bestseller">Bestseller</span>' : ''}
            </div>
        </div>
    `;
    
    return card;
}

// Get product image
function getProductImage(product) {
    // Use existing images if available, otherwise use placeholder
    if (product.images && product.images[0]) {
        return product.images[0];
    }
    return getPlaceholderImage(product.category);
}

// Get placeholder image based on category
function getPlaceholderImage(category) {
    const placeholders = {
        'Air Force 1': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iIzAwMDAwMCIvPgo8L3N2Zz4K',
        'Jordan 1': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkYwMDAwIi8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iIzAwMDAwMCIvPgo8L3N2Zz4K',
        'Jordan 3': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iIzAwMDAwMCIvPgo8L3N2Zz4K',
        'Jordan 4': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDAwMEZGIi8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iI0ZGRkZGRiIvPgo8L3N2Zz4K',
        'Jordan 5': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkYwMDAwIi8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iI0ZGRkZGRiIvPgo8L3N2Zz4K',
        'Jordan 11': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iIzAwMDAwMCIvPgo8L3N2Zz4K'
    };
    return placeholders[category] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik04MCA2MEgxMjBWMTQwSDgwVjYwWiIgZmlsbD0iI0NDQyIvPgo8L3N2Zz4K';
}

// Get color value for CSS
function getColorValue(color) {
    const colorMap = {
        'white': '#FFFFFF',
        'black': '#000000',
        'red': '#FF0000',
        'blue': '#0000FF',
        'yellow': '#FFFF00',
        'green': '#00FF00',
        'black/red': '#8B0000',
        'white/black': '#808080',
        'royal blue': '#4169E1',
        'chicago': '#FF6B35',
        'shadow': '#696969',
        'white/cement': '#F5F5F5',
        'black/cement': '#2F2F2F',
        'fire red': '#DC143C',
        'true blue': '#0073E6',
        'black/metallic': '#2C2C2C',
        'grape': '#8A2BE2',
        'white/fire red': '#FFB6C1',
        'concord': '#E6E6FA',
        'bred': '#8B0000',
        'space jam': '#191970',
        'cool grey': '#A9A9A9',
        'win like 96': '#FFD700'
    };
    return colorMap[color.toLowerCase()] || '#FF6B35';
}

// Setup loading/error helpers
function showLoading() {
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = '<div class="loading">Loading products...</div>';
}

function showError(msg) {
    const grid = document.getElementById('productsGrid');
    if (grid) grid.innerHTML = `<div class="error-msg">${msg}</div>`;
    showNotification(msg, 'error');
}

// Setup event listeners
function setupLegacyEvents() {
    // Category filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const onclickAttr = this.getAttribute('onclick');
            if (onclickAttr) {
                const match = onclickAttr.match(/'([^']+)'/);
                if (match) {
                    const category = match[1];
                    filterProductsByCategory(category);
                    
                    // Update active button
                    filterButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                }
            }
        });
    });
    
    // Search functionality
    const searchInput = document.querySelector('.srch');
    const searchButton = document.querySelector('.btn');
    
    searchButton.addEventListener('click', function(e) {
        e.preventDefault();
        const searchTerm = searchInput.value.toLowerCase();
        searchProducts(searchTerm);
    });
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const searchTerm = this.value.toLowerCase();
            searchProducts(searchTerm);
        }
    });
}

// Filter products by category
function filterProductsByCategory(category) {
    currentCategory = category;
    
    if (category === 'all') {
        displayProducts(allProducts);
    } else {
        const filteredProducts = allProducts.filter(product => 
            product.category.toLowerCase().replace(/\s+/g, '-') === category
        );
        displayProducts(filteredProducts);
    }
}

// Search products
function searchProducts(searchTerm) {
    if (!searchTerm.trim()) {
        filterProductsByCategory(currentCategory);
        return;
    }
    
    const filteredProducts = allProducts.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
    );
    
    displayProducts(filteredProducts);
}

function addProductEventListeners() {
    // Quick View buttons
    const quickViewButtons = document.querySelectorAll('.quick-view-btn');
    quickViewButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const productId = this.dataset.productId;
            openQuickViewDynamic(productId);
        });
    });

    // Add to cart buttons
    const addToCartButtons = document.querySelectorAll('.btn-add-cart');
    addToCartButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const productId = parseInt(this.dataset.productId);
            const product = allProducts.find(p => p.id === productId);
            if (product) {
                addToCart(product.name, product.price, this);
            }
        });
    });
    
    // Wishlist buttons
    const wishlistButtons = document.querySelectorAll('.btn-wishlist');
    wishlistButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const productId = parseInt(this.dataset.productId);
            const product = allProducts.find(p => p.id === productId);
            if (product) {
                addToWishlist(product.name);
            }
        });
    });
    
    // Color selection
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from siblings
            const siblings = this.parentNode.querySelectorAll('.color-option');
            siblings.forEach(sibling => sibling.classList.remove('selected'));
            
            // Add selected class to clicked option
            this.classList.add('selected');
        });
    });
    
    // Gallery buttons
    const galleryButtons = document.querySelectorAll('.view-gallery-btn');
    galleryButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const productId = parseInt(this.dataset.productId);
            toggleGallery(productId);
        });
    });
    
    // Gallery item clicks
    const galleryItems = document.querySelectorAll('.gallery-item');
    galleryItems.forEach(item => {
        item.addEventListener('click', function() {
            const productId = parseInt(this.dataset.productId);
            const imageSrc = this.dataset.image;
            const color = this.dataset.color;
            selectGalleryImage(productId, imageSrc, color);
        });
    });
    
    // Main product image clicks
    const mainImages = document.querySelectorAll('.main-product-image');
    mainImages.forEach(img => {
        img.addEventListener('click', function() {
            const productId = parseInt(this.dataset.productId);
            toggleGallery(productId);
        });
    });
}

// Open Quick View with dynamic product data
function openQuickViewDynamic(productId) {
    const product = allProducts.find(p => p.id === parseInt(productId));
    if (!product) {
        showNotification('Product details not found', 'error');
        return;
    }

    const modal = document.getElementById('product-modal');
    const modalImage = document.getElementById('modal-image');
    const modalTitle = document.getElementById('modal-title');
    const modalProductName = document.getElementById('modal-product-name');
    const modalPrice = document.getElementById('modal-price');
    const modalAddToCart = document.getElementById('modal-add-to-cart');
    const modalWishlist = document.getElementById('modal-wishlist');

    modalImage.src = getProductImage(product);
    modalImage.alt = product.name;
    modalTitle.textContent = product.name;
    modalProductName.textContent = product.name;
    modalPrice.textContent = `Sale $${product.price}`;

    currentZoom = 1;
    selectedSize = null;
    modalImage.style.transform = 'scale(1)';

    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.addEventListener('click', function() {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedSize = this.textContent.trim();
        });
    });

    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const resetZoom = document.getElementById('reset-zoom');
    if (zoomIn && zoomOut && resetZoom) {
        zoomIn.onclick = function() {
            currentZoom = Math.min(currentZoom + 0.1, 2);
            modalImage.style.transform = `scale(${currentZoom})`;
        };
        zoomOut.onclick = function() {
            currentZoom = Math.max(currentZoom - 0.1, 0.8);
            modalImage.style.transform = `scale(${currentZoom})`;
        };
        resetZoom.onclick = function() {
            currentZoom = 1;
            modalImage.style.transform = 'scale(1)';
        };
    }

    modalAddToCart.onclick = function() {
        if (!selectedSize) {
            alert('Please select a size first!');
            return;
        }
        addToCart(product.name, product.price);
        modal.style.display = 'none';
    };

    modalWishlist.onclick = function() {
        addToWishlist(product.name);
        updateModalWishlistButton(product.name);
    };

    modal.style.display = 'flex';
}

// Add product to cart (API-based, not used on static page)
async function addToCartById(productId) {
    try {
        const product = allProducts.find(p => p.id === productId);
        if (!product) {
            showError('Product not found');
            return;
        }
        
        const selectedColor = document.querySelector(`[data-product-id="${productId}"] .color-option.selected`);
        const color = selectedColor ? selectedColor.dataset.color : product.colors[0];
        
        const response = await skySmartFetch('/api/cart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                productId: productId,
                size: product.sizes[0], // Default to first size
                quantity: 1
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess(`${product.name} added to cart!`);
            // Update button text temporarily
            const button = document.querySelector(`[data-product-id="${productId}"].btn-add-cart`);
            const originalText = button.textContent;
            button.textContent = 'Added!';
            button.style.background = '#28a745';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
        } else {
            showError('Failed to add to cart');
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        showError('Failed to add to cart');
    }
}

// Add product to wishlist (API-based, not used on static page)
async function addToWishlistById(productId) {
    try {
        const product = allProducts.find(p => p.id === productId);
        if (!product) {
            showError('Product not found');
            return;
        }
        
        const response = await skySmartFetch('/api/wishlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                productId: productId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess(`${product.name} added to wishlist!`);
            // Update button text temporarily
            const button = document.querySelector(`[data-product-id="${productId}"].btn-wishlist`);
            const originalText = button.textContent;
            button.textContent = '♥ Added!';
            button.style.background = '#ff6b35';
            button.style.color = 'white';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
                button.style.color = '';
            }, 2000);
        } else {
            showError('Failed to add to wishlist');
        }
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        showError('Failed to add to wishlist');
    }
}

// Show loading state
function showLoading() {
    const productsGrid = document.getElementById('productsGrid');
    productsGrid.innerHTML = '<div class="loading">Loading products...</div>';
}

// Show error message
function showError(message) {
    const productsGrid = document.getElementById('productsGrid');
    productsGrid.innerHTML = `
        <div class="error-message">
            <h3>Error</h3>
            <p>${message}</p>
            <button onclick="loadProducts()" class="retry-btn">Try Again</button>
        </div>
    `;
}

// Show success message
function showSuccess(message) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1000;
            font-family: 'Segoe UI', sans-serif;
            font-weight: 600;
        ">
            ${message}
        </div>
    `;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Gallery functionality
function toggleGallery(productId) {
    const gallery = document.getElementById(`gallery-${productId}`);
    const button = document.querySelector(`[data-product-id="${productId}"].view-gallery-btn`);
    
    if (gallery.style.display === 'none' || gallery.style.display === '') {
        gallery.style.display = 'flex';
        button.textContent = '✕ Close Gallery';
        button.style.background = '#dc2626';
    } else {
        gallery.style.display = 'none';
        button.textContent = '📷 View Gallery';
        button.style.background = '';
    }
}

function selectGalleryImage(productId, imageSrc, color) {
    const mainImage = document.querySelector(`[data-product-id="${productId}"].main-product-image`);
    const galleryItems = document.querySelectorAll(`#gallery-${productId} .gallery-item`);
    
    // Update main image
    mainImage.src = imageSrc;
    mainImage.alt = `${color} colorway`;
    
    // Update active gallery item
    galleryItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.image === imageSrc) {
            item.classList.add('active');
        }
    });
    
    // Update color selection
    const colorOptions = document.querySelectorAll(`[data-product-id="${productId}"] .color-option`);
    colorOptions.forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.color === color) {
            option.classList.add('selected');
        }
    });
    
    // Show success message
    showSuccess(`Switched to ${color} colorway!`);
}

// Smooth scrolling for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
