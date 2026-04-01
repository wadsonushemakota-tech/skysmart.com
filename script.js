// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for all anchor links
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Search functionality
    const searchInput = document.querySelector('.srch');
    const searchButton = document.querySelector('.btn');
    
    searchButton.addEventListener('click', function(e) {
        e.preventDefault();
        const searchTerm = searchInput.value.toLowerCase();
        
        if (searchTerm) {
            // Simple search functionality - you can enhance this
            alert(`Searching for: ${searchTerm}`);
            // Here you would typically send the search term to your backend
        }
    });

    // Form submission handling
    const loginForm = document.querySelector('.form');
    const loginButton = document.querySelector('.btnn');
    
    loginButton.addEventListener('click', function(e) {
        e.preventDefault();
        
        const email = document.querySelector('input[type="email"]').value;
        const password = document.querySelector('input[type="password"]').value;
        
        if (email && password) {
            // Here you would send the data to your backend
            console.log('Login attempt:', { email, password });
            alert('Login functionality will be connected to backend!');
        } else {
            alert('Please fill in all fields');
        }
    });

    // Purchase button functionality
    const purchaseButton = document.querySelector('.cn');
    if (purchaseButton) {
        purchaseButton.addEventListener('click', function(e) {
            e.preventDefault();
            // Navigate to products page
            window.location.href = 'products.html';
        });
    }

    // Add to cart functionality
    const addToCartButton = document.querySelector('.btn-primary');
    if (addToCartButton) {
        addToCartButton.addEventListener('click', function(e) {
            e.preventDefault();
            const productName = "Air Jordan 4 \"In Blue\""; // Fixed name for hero product
            const price = 25.00;
            const size = document.querySelector('#size').value;
            
            let cart = JSON.parse(localStorage.getItem('skySmartCart') || '[]');
            const existingItem = cart.find(item => item.name === productName);

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    name: productName,
                    price: price,
                    quantity: 1,
                    size: size,
                    addedAt: new Date().toISOString()
                });
            }

            localStorage.setItem('skySmartCart', JSON.stringify(cart));
            
            // Dispatch custom event to update other pages or parts of UI
            window.dispatchEvent(new Event('storage'));
            
            alert(`Added ${productName} size ${size} to cart!`);
        });
    }

    // Wishlist functionality
    const wishlistButton = document.querySelector('.btn-secondary');
    if (wishlistButton) {
        wishlistButton.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Added to wishlist!');
        });
    }

    // Navbar scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(0,0,0,0.9)';
            navbar.style.backdropFilter = 'blur(20px)';
        } else {
            navbar.style.background = 'rgba(0,0,0,0.1)';
            navbar.style.backdropFilter = 'blur(10px)';
        }
    });

    // Image hover effects for products
    const productImages = document.querySelectorAll('.products img');
    productImages.forEach(img => {
        img.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        img.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });

    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe sections for animation
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });
});

// API functions for backend communication
function skySmartFetch(path, options) {
    const url =
        typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(path) : path;
    return fetch(url, options);
}

async function searchProducts(query) {
    try {
        const response = await skySmartFetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

async function addToCart(productId, size, quantity = 1) {
    try {
        const response = await skySmartFetch('/api/cart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                productId,
                size,
                quantity
            })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Add to cart error:', error);
        return { success: false, error: error.message };
    }
}

async function loginUser(email, password) {
    try {
        const response = await skySmartFetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

async function registerUser(email, password, name) {
    try {
        const response = await skySmartFetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password, name })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message };
    }
}

// Get all category buttons
const buttons = document.querySelectorAll(".category-btn");
// Get all product items
const products = document.querySelectorAll(".product");

// Loop through each button
buttons.forEach(button => {
button.addEventListener("click", () => {

    // 1. Remove "active" class from all buttons
    buttons.forEach(btn => btn.classList.remove("active"));

    // 2. Add "active" to the clicked button
    button.classList.add("active");

    // 3. Get the category name from the clicked button
    const category = button.getAttribute("data-category");

    // 4. Show/Hide products based on category
    products.forEach(product => {
    if (category === "all") {
        // Show all products if "All Products" button is clicked
        product.style.display = "block";
    } else {
        // Show only matching category, hide others
        if (product.getAttribute("data-category") === category) {
        product.style.display = "block";
        } else {
        product.style.display = "none";
        }
    }
        });
  });
});