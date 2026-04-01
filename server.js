require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const { Pool } = require('pg');

const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;

const API_ONLY = process.env.API_ONLY === '1' || process.env.API_ONLY === 'true';

function databaseSslConfig() {
    if (process.env.DATABASE_SSL === '0') return false;
    const url = (process.env.DATABASE_URL || '').toLowerCase();
    if (url.includes('supabase.co')) return { rejectUnauthorized: false };
    if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
    return false;
}

function resolvePublicSiteOrigin(req) {
    const explicit =
        process.env.PUBLIC_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : null);
    if (explicit) return String(explicit).replace(/\/+$/, '');
    return `${req.protocol}://${req.get('host')}`;
}

function parseCorsOrigin() {
    const raw = process.env.CORS_ORIGIN;
    if (!raw || !String(raw).trim()) return null;
    const list = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    return list;
}

const configuredCorsOrigin = parseCorsOrigin();
const socketCorsOrigin = configuredCorsOrigin || '*';

const app = express();
if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
}

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: socketCorsOrigin,
        methods: ['GET', 'POST'],
    },
});

const PORT = process.env.PORT || 3000;

const DEFAULT_DEV_JWT = 'dev-only-insecure-jwt-secret';
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET must be set when NODE_ENV=production');
        process.exit(1);
    }
    console.warn('⚠️  JWT_SECRET not set; using insecure development default');
    JWT_SECRET = DEFAULT_DEV_JWT;
}

// PostgreSQL Connection (Supabase / managed Postgres need SSL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSslConfig(),
});

// Database Initialization
const initDb = async () => {
    let client;
    try {
        client = await pool.connect();
        
        // Create basic tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                price DECIMAL NOT NULL,
                sizes INTEGER[],
                colors TEXT[],
                images TEXT[],
                description TEXT,
                category TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                text TEXT,
                media_url TEXT,
                media_type TEXT DEFAULT 'text',
                reply_to_id INTEGER REFERENCES messages(id),
                reply_to_user TEXT,
                reply_to_text TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add columns if they don't exist (migration)
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_url') THEN
                    ALTER TABLE messages ADD COLUMN media_url TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='media_type') THEN
                    ALTER TABLE messages ADD COLUMN media_type TEXT DEFAULT 'text';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='reply_to_id') THEN
                    ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='reply_to_user') THEN
                    ALTER TABLE messages ADD COLUMN reply_to_user TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='reply_to_text') THEN
                    ALTER TABLE messages ADD COLUMN reply_to_text TEXT;
                END IF;
            END $$;
        `);

        console.log('✅ Database tables initialized');

        // Check if products exist, if not seed them
        const res = await client.query('SELECT COUNT(*) FROM products');
        if (parseInt(res.rows[0].count) === 0) {
            const initialProducts = [
                ["Jordan 4 Original", 25, [6,7,8,9,10,11,12], ['Blue', 'Red', 'Yellow', 'Black', 'White'], ['images/j4.jpg', 'images/2.jpg', 'images/3.jpg'], "Classic Air Jordan 4 in stunning colorways", "jordans"],
                ["Air Force 1 White", 15, [6,7,8,9,10,11,12], ['White', 'Black', 'Red', 'Blue', 'Green'], ['images/bl.jpg', 'images/af1-black.jpg', 'images/af1-red.jpg'], "The iconic Air Force 1 in classic white leather", "nike"],
                ["Air Jordan 11", 25, [6,7,8,9,10,11,12], ['Concord', 'Bred', 'Space Jam', 'Cool Grey', 'Win Like 96'], ['images/j11.jpg', 'images/j11-bred.jpg', 'images/j11-space.jpg'], "Elegant Air Jordan 11 with patent leather and carbon fiber", "jordans"],
                ["Air Max 90P", 22, [6,7,8,9,10,11,12], ['Grey', 'Black', 'Volt'], ['images/max.jpg'], "Performance and lifestyle Air Max 90", "nike"],
                ["Timberland Boots", 30, [6,7,8,9,10,11,12], ['Wheat', 'Black'], ['images/timb.jpg'], "Durable and stylish Timberland boots", "lifestyle"],
                ["SB Dunk Red", 15, [6,7,8,9,10,11,12], ['Red', 'Blue'], ['images/se.jpg'], "Classic SB Dunk low profile", "sneakers"],
                ["Air Force Plain White", 15, [6,7,8,9,10,11,12], ['White'], ['images/n22.jpg'], "Minimalist all-white Air Force 1", "nike"],
                ["School Wear Pack", 18, [6,7,8,9,10,11,12], ['Black'], ['images/lv.jpg'], "Durable school wear shoes", "schoolwear"]
            ];
            
            for (const p of initialProducts) {
                await client.query(
                    'INSERT INTO products (name, price, sizes, colors, images, description, category) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    p
                );
            }
            console.log('✅ Initial products seeded');
        }
    } catch (err) {
        console.error(
            '❌ Database connection error. Check DATABASE_URL (e.g. Supabase Project Settings → Database → URI).'
        );
        console.error('Error detail:', err.message);
    } finally {
        if (client) client.release();
    }
};

initDb();

// Create uploads directory if it doesn't exist
const uploadDir = 'uploads/chat';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup for chat media
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Socket.io logic
io.on('connection', async (socket) => {
    console.log('A user connected to chat');
    
    try {
        // Send existing messages to new user from DB
        const res = await pool.query(`
            SELECT 
                id, 
                username as user, 
                text, 
                media_url as media, 
                media_type, 
                reply_to_id, 
                reply_to_user, 
                reply_to_text, 
                timestamp 
            FROM messages 
            ORDER BY timestamp ASC 
            LIMIT 100
        `);
        socket.emit('chat history', res.rows);
    } catch (err) {
        console.error('Error fetching chat history:', err);
    }

    socket.on('chat message', async (msg) => {
        try {
            const res = await pool.query(
                `INSERT INTO messages (
                    username, 
                    text, 
                    media_url, 
                    media_type, 
                    reply_to_id, 
                    reply_to_user, 
                    reply_to_text
                ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
                RETURNING 
                    id, 
                    username as user, 
                    text, 
                    media_url as media, 
                    media_type, 
                    reply_to_id, 
                    reply_to_user, 
                    reply_to_text, 
                    timestamp`,
                [
                    msg.user || 'Anonymous', 
                    msg.text || null, 
                    msg.media || null, 
                    msg.media_type || 'text',
                    msg.reply_to_id || null,
                    msg.reply_to_user || null,
                    msg.reply_to_text || null
                ]
            );
            io.emit('chat message', res.rows[0]);
        } catch (err) {
            console.error('Error saving chat message:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected from chat');
    });
});

// Middleware
if (configuredCorsOrigin) {
    app.use(cors({ origin: configuredCorsOrigin }));
} else {
    app.use(cors());
    if (process.env.NODE_ENV === 'production') {
        console.warn(
            '⚠️  CORS_ORIGIN not set; all origins are allowed. Set CORS_ORIGIN=https://your-site.com for production.'
        );
    }
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

if (!API_ONLY) {
    app.use(express.static('.'));
    app.use('/dist', express.static(path.join(__dirname, 'dist')));
    app.get('/store', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes

app.get('/api/health', (req, res) => {
    res.json({ ok: true, apiOnly: API_ONLY, uptime: process.uptime() });
});

// Search products
app.get('/api/search', async (req, res) => {
    try {
        const query = `%${req.query.q.toLowerCase()}%`;
        const result = await pool.query(
            'SELECT * FROM products WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1',
            [query]
        );
        res.json({ success: true, products: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products');
        res.json({ success: true, products: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get products by category
app.get('/api/products/category/:category', async (req, res) => {
    try {
        const category = req.params.category;
        const result = await pool.query(
            "SELECT * FROM products WHERE REPLACE(LOWER(category), ' ', '-') = $1",
            [category.toLowerCase()]
        );
        res.json({ success: true, products: result.rows, category });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT category FROM products');
        res.json({ success: true, categories: result.rows.map(r => r.category) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [parseInt(req.params.id)]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        res.json({ success: true, product: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, hashedPassword, name]
        );

        const user = result.rows[0];
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ 
            success: true, 
            message: 'User registered successfully',
            token,
            user
        });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ success: false, message: 'User already exists' });
        }
        res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
    }
});

// User login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ 
            success: true, 
            message: 'Login successful',
            token,
            user: { id: user.id, email: user.email, name: user.name }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
});

// Get user profile (protected route)
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [req.user.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Contact form submission
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    console.log('Contact form submission:', { name, email, message });
    res.json({ 
        success: true, 
        message: 'Thank you for your message! We will get back to you soon.' 
    });
});

// Newsletter subscription
app.post('/api/newsletter', (req, res) => {
    const { email } = req.body;
    console.log('Newsletter subscription:', { email });
    res.json({ 
        success: true, 
        message: 'Successfully subscribed to newsletter!' 
    });
});

// Stripe Checkout — host collects payment on Stripe; requires STRIPE_SECRET_KEY in .env
app.post('/api/payments/create-checkout-session', async (req, res) => {
    if (!stripe) {
        return res.status(503).json({
            success: false,
            message: 'Online payments are not configured. Add STRIPE_SECRET_KEY from your Stripe Dashboard, then restart the server.',
        });
    }
    try {
        const { items, customerEmail, successUrl, cancelUrl } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your bag is empty.' });
        }

        const line_items = items.map((item) => {
            const unitAmount = Math.round(Number(item.price) * 100);
            if (!item.name || Number.isNaN(unitAmount) || unitAmount < 50) {
                throw new Error('Each item needs a name and price of at least $0.50 USD.');
            }
            const qty = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));
            return {
                quantity: qty,
                price_data: {
                    currency: 'usd',
                    product_data: { name: String(item.name).slice(0, 120) },
                    unit_amount: unitAmount,
                },
            };
        });

        const origin = resolvePublicSiteOrigin(req);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: customerEmail && String(customerEmail).includes('@')
                ? String(customerEmail).trim().slice(0, 320)
                : undefined,
            line_items,
            success_url:
                successUrl ||
                `${origin.replace(/\/+$/, '')}/store?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:
                cancelUrl || `${origin.replace(/\/+$/, '')}/store?checkout=cancel`,
            billing_address_collection: 'required',
            shipping_address_collection: {
                allowed_countries: ['US', 'CA', 'GB', 'NG', 'GH', 'KE'],
            },
        });

        res.json({ success: true, url: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Could not start checkout.',
        });
    }
});

// Endpoint for chat media upload
app.post('/api/chat/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const mediaUrl = `/uploads/chat/${req.file.filename}`;
    res.json({ success: true, mediaUrl });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Sky Smart server listening on port ${PORT}`);
    console.log(`📱 API: /api/ (health: GET /api/health)`);
    if (API_ONLY) {
        console.log(`🔧 API_ONLY mode — static site is served elsewhere (e.g. Vercel)`);
    } else {
        console.log(`🛍 Mobile shop (PWA): /store — run "npm run build" first`);
    }
    if (stripe) {
        console.log(`💳 Stripe Checkout enabled`);
    } else {
        console.log(`💳 Stripe Checkout disabled — set STRIPE_SECRET_KEY in .env to accept card payments`);
    }
    console.log(`💬 Real-time chat active!`);
});
