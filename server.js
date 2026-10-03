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
const crypto = require('crypto');
const { Pool } = require('pg');
const { ensureSchema } = require('./db-schema');

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

// Hosted Postgres (e.g. Supabase) can drop idle connections; without this the process crashes
pool.on('error', (err) => {
    console.error('Postgres idle client error:', err.message);
});

// Set once the messages table is ready; until then chat falls back to an in-memory store
let chatDbReady = false;

// Database Initialization
const initDb = async () => {
    let client;
    try {
        client = await pool.connect();
        
        await ensureSchema(client);

        chatDbReady = true;
        console.log('✅ Database tables initialized');

        // Check if products exist, if not seed them
        const res = await client.query('SELECT COUNT(*) FROM products');
        if (parseInt(res.rows[0].count) === 0) {
            const initialProducts = [
                ["Jordan 4 Original", 25, [6,7,8,9,10,11,12], ['Blue', 'Red', 'Yellow', 'Black', 'White'], ['images/j4.jpg'], "Classic Air Jordan 4 in stunning colorways", "jordans"],
                ["Air Force 1 White", 15, [6,7,8,9,10,11,12], ['White', 'Black', 'Red', 'Blue', 'Green'], ['images/bl.jpg'], "The iconic Air Force 1 in classic white leather", "nike"],
                ["Air Jordan 11", 25, [6,7,8,9,10,11,12], ['Concord', 'Bred', 'Space Jam', 'Cool Grey', 'Win Like 96'], ['images/j11.jpg'], "Elegant Air Jordan 11 with patent leather and carbon fiber", "jordans"],
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
        console.error('   Retrying in 30s; chat uses in-memory storage until then.');
        setTimeout(initDb, 30000);
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

// Chat media goes to Supabase Storage when configured (survives redeploys), otherwise to local disk
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_BUCKET = (process.env.SUPABASE_BUCKET || 'chat-media').trim();
const useSupabaseStorage = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabasePublicPrefix = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/`;

function supabaseHeaders(extra) {
    return { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
}

async function ensureSupabaseBucket() {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: SUPABASE_BUCKET, name: SUPABASE_BUCKET, public: true }),
    });
    const body = await res.text();
    if (!res.ok && !/already exists|Duplicate/i.test(body)) {
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
}

if (useSupabaseStorage) {
    ensureSupabaseBucket()
        .then(() => console.log(`✅ Chat uploads: Supabase Storage bucket "${SUPABASE_BUCKET}"`))
        .catch((err) => console.error('❌ Supabase Storage bucket setup failed:', err.message));
}

function chatUploadName(originalname) {
    const ext = path.extname(originalname || '').replace(/[^.\w]/g, '').slice(0, 8);
    return Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
}

// Returns the public URL (Supabase) or site-relative path (disk) for the stored file
async function storeChatUpload(file) {
    const name = chatUploadName(file.originalname);
    if (!useSupabaseStorage) {
        await fs.promises.writeFile(path.join(uploadDir, name), file.buffer);
        return `/uploads/chat/${name}`;
    }
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/chat/${name}`, {
        method: 'POST',
        headers: supabaseHeaders({
            'Content-Type': String(file.mimetype).split(';')[0].trim(),
            'Cache-Control': 'max-age=31536000',
        }),
        body: file.buffer,
    });
    if (!res.ok) throw new Error(`Supabase upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return `${supabasePublicPrefix}chat/${name}`;
}

function isStoredChatMedia(url) {
    if (/^\/uploads\/chat\/[\w.-]+$/.test(url)) return true;
    return useSupabaseStorage && url.startsWith(supabasePublicPrefix + 'chat/') &&
        /^[\w.-]+$/.test(url.slice((supabasePublicPrefix + 'chat/').length));
}

// Multer setup for chat media (kept in memory, then written by storeChatUpload)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg',
        'audio/mp4', 'audio/x-m4a', 'audio/aac'
    ];
    // Recorders send e.g. "audio/webm;codecs=opus"
    if (allowedTypes.includes(String(file.mimetype).split(';')[0].trim())) {
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

// ---- Community chat (Socket.io) ----
const CHAT_HISTORY_LIMIT = 100;
const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const CHAT_MEDIA_TYPES = ['text', 'image', 'voice'];

// Public, non-reversible id for a browser; the raw clientId authorises deletes so it is never sent out
function senderTag(clientId) {
    return crypto.createHash('sha256').update(String(clientId)).digest('hex').slice(0, 16);
}

function cleanString(value, max) {
    if (typeof value !== 'string') return null;
    const s = value.trim().slice(0, max);
    return s || null;
}

function sanitizeIncoming(msg) {
    if (!msg || typeof msg !== 'object') return null;
    const text = cleanString(msg.text, 2000);
    const mediaType = CHAT_MEDIA_TYPES.includes(msg.media_type) ? msg.media_type : 'text';
    let media = cleanString(msg.media, 300);
    // Only files that came through /api/chat/upload
    if (mediaType === 'text' || (media && !isStoredChatMedia(media))) media = null;
    if (mediaType !== 'text' && !media) return null;
    if (!text && !media) return null;
    const replyId = Number.isInteger(msg.reply_to_id) && msg.reply_to_id > 0 ? msg.reply_to_id : null;
    return {
        user: cleanString(msg.user, 40) || 'Anonymous',
        text,
        media,
        media_type: mediaType,
        reply_to_id: replyId,
        reply_to_user: replyId ? cleanString(msg.reply_to_user, 40) : null,
        reply_to_text: replyId ? cleanString(msg.reply_to_text, 200) : null,
    };
}

function publicMessage(row) {
    const deleted = row.deleted === true;
    return {
        id: row.id,
        user: row.username,
        sender: row.sender_id ? senderTag(row.sender_id) : null,
        text: deleted ? null : row.text,
        media: deleted ? null : row.media_url,
        media_type: deleted ? 'text' : row.media_type || 'text',
        reply_to_id: row.reply_to_id,
        reply_to_user: row.reply_to_user,
        reply_to_text: row.reply_to_text,
        deleted,
        reactions: deleted ? {} : row.reactions || {},
        seen: row.seen === true,
        timestamp: row.timestamp,
    };
}

// Postgres when available, otherwise an in-memory room (lost on restart) so chat still works
const memoryChat = { rows: [], nextId: 1 };
const chatStore = {
    async recent() {
        if (!chatDbReady) return memoryChat.rows.slice(-CHAT_HISTORY_LIMIT);
        const res = await pool.query(
            'SELECT * FROM (SELECT * FROM messages ORDER BY id DESC LIMIT $1) m ORDER BY id ASC',
            [CHAT_HISTORY_LIMIT]
        );
        return res.rows;
    },

    async insert(m, clientId) {
        if (!chatDbReady) {
            const row = {
                id: memoryChat.nextId++,
                username: m.user,
                sender_id: clientId,
                text: m.text,
                media_url: m.media,
                media_type: m.media_type,
                reply_to_id: memoryChat.rows.some((r) => r.id === m.reply_to_id) ? m.reply_to_id : null,
                reply_to_user: m.reply_to_user,
                reply_to_text: m.reply_to_text,
                deleted: false,
                reactions: {},
                seen: false,
                timestamp: new Date(),
            };
            memoryChat.rows.push(row);
            if (memoryChat.rows.length > 500) memoryChat.rows.shift();
            return row;
        }
        const res = await pool.query(
            `INSERT INTO messages (username, sender_id, text, media_url, media_type, reply_to_id, reply_to_user, reply_to_text)
             VALUES ($1, $2, $3, $4, $5, (SELECT id FROM messages WHERE id = $6), $7, $8)
             RETURNING *`,
            [m.user, clientId, m.text, m.media, m.media_type, m.reply_to_id, m.reply_to_user, m.reply_to_text]
        );
        return res.rows[0];
    },

    async remove(id, clientId) {
        if (!chatDbReady) {
            const row = memoryChat.rows.find((r) => r.id === id && r.sender_id === clientId && !r.deleted);
            if (!row) return null;
            Object.assign(row, { deleted: true, text: null, media_url: null, reactions: {} });
            return row;
        }
        const res = await pool.query(
            `UPDATE messages SET deleted = TRUE, text = NULL, media_url = NULL, reactions = '{}'::jsonb
             WHERE id = $1 AND sender_id = $2 AND deleted IS NOT TRUE
             RETURNING *`,
            [id, clientId]
        );
        return res.rows[0] || null;
    },

    // emoji === null removes this sender's reaction
    async react(id, tag, emoji) {
        if (!chatDbReady) {
            const row = memoryChat.rows.find((r) => r.id === id && !r.deleted);
            if (!row) return null;
            const next = { ...row.reactions };
            if (emoji) next[tag] = emoji;
            else delete next[tag];
            row.reactions = next;
            return row;
        }
        const res = emoji
            ? await pool.query(
                  `UPDATE messages SET reactions = COALESCE(reactions, '{}'::jsonb) || jsonb_build_object($2::text, $3::text)
                   WHERE id = $1 AND deleted IS NOT TRUE RETURNING *`,
                  [id, tag, emoji]
              )
            : await pool.query(
                  `UPDATE messages SET reactions = COALESCE(reactions, '{}'::jsonb) - $2::text
                   WHERE id = $1 AND deleted IS NOT TRUE RETURNING *`,
                  [id, tag]
              );
        return res.rows[0] || null;
    },

    // Marks other people's messages up to upToId as seen; returns the ids that changed
    async markSeen(upToId, clientId) {
        if (!chatDbReady) {
            const ids = [];
            memoryChat.rows.forEach((r) => {
                if (r.id <= upToId && !r.seen && r.sender_id !== clientId) {
                    r.seen = true;
                    ids.push(r.id);
                }
            });
            return ids;
        }
        const res = await pool.query(
            `UPDATE messages SET seen = TRUE
             WHERE id <= $1 AND seen IS NOT TRUE AND sender_id IS DISTINCT FROM $2
             RETURNING id`,
            [upToId, clientId]
        );
        return res.rows.map((r) => r.id);
    },
};

const recentClientKeys = new Map(); // clientId:client_key -> saved message

function broadcastPresence() {
    const people = new Set();
    io.of('/').sockets.forEach((s) => people.add(s.data.clientId));
    io.emit('presence', { online: people.size });
}

io.on('connection', async (socket) => {
    const rawId = socket.handshake.auth && socket.handshake.auth.clientId;
    const clientId = typeof rawId === 'string' && /^[\w-]{8,64}$/.test(rawId) ? rawId : 'anon-' + socket.id;
    const tag = senderTag(clientId);
    socket.data.clientId = clientId;

    socket.emit('session', { sender: tag, reactions: CHAT_REACTIONS, persistent: chatDbReady });
    broadcastPresence();

    try {
        const rows = await chatStore.recent();
        socket.emit('chat history', rows.map(publicMessage));
    } catch (err) {
        console.error('Error fetching chat history:', err);
    }

    let recentSends = [];
    socket.on('chat message', async (msg, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const now = Date.now();
        recentSends = recentSends.filter((t) => now - t < 10000);
        if (recentSends.length >= 15) {
            return reply({ ok: false, error: 'You are sending messages too fast. Wait a moment.' });
        }
        // A resend after a reconnect or timeout carries the same client_key: answer with the saved copy
        const dedupeKey =
            msg && typeof msg.client_key === 'string' && /^[\w-]{1,40}$/.test(msg.client_key)
                ? clientId + ':' + msg.client_key
                : null;
        if (dedupeKey && recentClientKeys.has(dedupeKey)) {
            return reply({ ok: true, message: recentClientKeys.get(dedupeKey) });
        }
        const clean = sanitizeIncoming(msg);
        if (!clean) return reply({ ok: false, error: 'Message was empty or invalid.' });
        recentSends.push(now);
        try {
            const out = publicMessage(await chatStore.insert(clean, clientId));
            if (dedupeKey) {
                recentClientKeys.set(dedupeKey, out);
                if (recentClientKeys.size > 1000) recentClientKeys.delete(recentClientKeys.keys().next().value);
            }
            reply({ ok: true, message: out });
            socket.broadcast.emit('chat message', out);
        } catch (err) {
            console.error('Error saving chat message:', err);
            reply({ ok: false, error: 'Could not send message. Try again.' });
        }
    });

    socket.on('typing', (state) => {
        socket.broadcast.emit('typing', {
            id: socket.id,
            user: cleanString(state && state.user, 40) || 'Someone',
            typing: !!(state && state.typing),
        });
    });

    socket.on('delete message', async (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const id = Number(data && data.id);
        if (!Number.isInteger(id)) return reply({ ok: false });
        try {
            const row = await chatStore.remove(id, clientId);
            if (!row) return reply({ ok: false, error: 'You can only delete your own messages.' });
            io.emit('message updated', publicMessage(row));
            reply({ ok: true });
        } catch (err) {
            console.error('Error deleting chat message:', err);
            reply({ ok: false, error: 'Could not delete message.' });
        }
    });

    socket.on('react', async (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const id = Number(data && data.id);
        const emoji = data ? data.emoji : undefined;
        if (!Number.isInteger(id) || (emoji !== null && !CHAT_REACTIONS.includes(emoji))) return reply({ ok: false });
        try {
            const row = await chatStore.react(id, tag, emoji);
            if (!row) return reply({ ok: false });
            io.emit('message updated', publicMessage(row));
            reply({ ok: true });
        } catch (err) {
            console.error('Error saving reaction:', err);
            reply({ ok: false });
        }
    });

    socket.on('seen', async (data) => {
        const upTo = Number(data && data.upTo);
        if (!Number.isInteger(upTo)) return;
        try {
            const ids = await chatStore.markSeen(upTo, clientId);
            if (ids.length) io.emit('messages seen', { ids });
        } catch (err) {
            console.error('Error marking messages seen:', err);
        }
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('typing', { id: socket.id, typing: false });
        broadcastPresence();
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

if (!API_ONLY) {
    // Serve all static assets first
    app.use(express.static('.'));
    
    // Serve React app only at /store and sub-routes
    app.get('/store*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
} else {
    // Chat media stored on disk (when Supabase Storage is not configured)
    app.use('/uploads', express.static('uploads'));
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
app.post('/api/chat/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    try {
        const mediaUrl = await storeChatUpload(req.file);
        res.json({ success: true, mediaUrl });
    } catch (err) {
        console.error('Chat upload failed:', err.message);
        res.status(502).json({ success: false, message: 'Could not store the file. Try again.' });
    }
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
