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

// Set once the tables exist; until then chat uses an in-memory store and ordering is disabled
let dbReady = false;

// Database Initialization
const initDb = async () => {
    let client;
    try {
        client = await pool.connect();
        
        await ensureSchema(client);

        dbReady = true;
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
        if (!dbReady) return memoryChat.rows.slice(-CHAT_HISTORY_LIMIT);
        const res = await pool.query(
            'SELECT * FROM (SELECT * FROM messages ORDER BY id DESC LIMIT $1) m ORDER BY id ASC',
            [CHAT_HISTORY_LIMIT]
        );
        return res.rows;
    },

    async insert(m, clientId) {
        if (!dbReady) {
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
        if (!dbReady) {
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
        if (!dbReady) {
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
        if (!dbReady) {
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

    socket.emit('session', { sender: tag, reactions: CHAT_REACTIONS, persistent: dbReady });
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

// Pinged on a schedule (.github/workflows/keep-awake.yml) so the free server doesn't sleep in business
// hours, and the database query counts as activity so Supabase's free project never pauses.
app.get('/api/keepalive', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, db: true, uptime: Math.round(process.uptime()) });
    } catch (err) {
        res.status(503).json({ ok: false, db: false, message: err.message });
    }
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

// ---- Shop orders ----
const catalog = require('./catalog');
const ORDER_STATUSES = ['pending_payment', 'paid', 'ready', 'shipped', 'completed', 'cancelled'];
const PAYMENT_METHODS = ['ecocash', 'bank', 'cash'];
const DELIVERY_METHODS = ['collect', 'delivery'];
const ADMIN_KEY = (process.env.ADMIN_KEY || '').trim();
const recentOrdersByIp = new Map(); // ip -> timestamps, simple abuse guard

function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

// Unambiguous characters only (no 0/O, 1/I/L)
function newOrderCode() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(6);
    return 'SS-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// Returns { order } with server-computed prices, or { error }
function validateOrder(body) {
    const b = body || {};
    const customer = b.customer || {};
    const delivery = b.delivery || {};
    const name = cleanString(customer.name, 60);
    const phone = cleanString(customer.phone, 30);
    const email = cleanString(customer.email, 120);
    if (!name || name.length < 2) return { error: 'Please enter your full name.' };
    const digits = phoneDigits(phone);
    if (digits.length < 9 || digits.length > 15) return { error: 'Please enter a valid phone number.' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Please enter a valid email address.' };
    if (!DELIVERY_METHODS.includes(delivery.method)) return { error: 'Please choose collection or delivery.' };
    const address = delivery.method === 'delivery' ? cleanString(delivery.address, 200) : null;
    const city = delivery.method === 'delivery' ? cleanString(delivery.city, 60) : null;
    if (delivery.method === 'delivery' && (!address || !city)) return { error: 'Please enter your delivery address and city.' };
    if (!PAYMENT_METHODS.includes(b.payment)) return { error: 'Please choose a payment method.' };

    const lines = Array.isArray(b.items) ? b.items : [];
    if (!lines.length) return { error: 'Your bag is empty.' };
    if (lines.length > 30) return { error: 'Too many items in one order.' };
    const items = [];
    for (const line of lines) {
        const product = catalog.byId[line && line.id];
        if (!product) return { error: 'One of the items is no longer available. Please refresh your bag.' };
        const size = String((line && line.size) || '');
        if (!product.sizes.includes(size)) return { error: `Please choose a size for ${product.name}.` };
        const qty = Number(line.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 10) return { error: 'Quantity must be between 1 and 10.' };
        items.push({ id: product.id, name: product.name, size, qty, price: product.price, image: product.image });
    }
    const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    return {
        order: {
            customer_name: name,
            phone,
            email,
            delivery_method: delivery.method,
            address,
            city,
            payment_method: b.payment,
            notes: cleanString(b.notes, 500),
            items,
            subtotal,
        },
    };
}

// ---- New-order alerts to the owner ----
// Email via Resend (RESEND_API_KEY) and/or WhatsApp via CallMeBot (CALLMEBOT_APIKEY); each is optional.
// Render's free plan blocks SMTP ports, so email goes through Resend's HTTPS API instead of Gmail SMTP.
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_URL = process.env.RESEND_URL || 'https://api.resend.com/emails';
const OWNER_EMAIL = (process.env.OWNER_EMAIL || catalog.business.email).trim();
// Resend's shared test sender can only deliver to the Resend account's own address, which is the owner here
const ALERT_FROM = process.env.ALERT_FROM || 'Sky Smart Orders <onboarding@resend.dev>';
const OWNER_WHATSAPP = (process.env.OWNER_WHATSAPP || catalog.business.whatsapp).replace(/\D/g, '');
const CALLMEBOT_APIKEY = (process.env.CALLMEBOT_APIKEY || '').trim();
const CALLMEBOT_URL = process.env.CALLMEBOT_URL || 'https://api.callmebot.com/whatsapp.php';
const SITE_URL = (process.env.PUBLIC_SITE_URL || String(process.env.CORS_ORIGIN || '').split(',')[0] || '').trim().replace(/\/+$/, '');

function orderAlertText(row) {
    const money = (n) => '$' + Number(n).toFixed(2).replace(/\.00$/, '');
    const delivery = row.delivery_method === 'delivery'
        ? `Deliver to: ${[row.address, row.city].filter(Boolean).join(', ')} (fee to confirm)`
        : 'Collection in Bulawayo';
    const payment = { ecocash: 'EcoCash', bank: 'Bank transfer', cash: 'Cash' }[row.payment_method] || row.payment_method;
    return [
        `🛍️ NEW SKY SMART ORDER ${row.code}`,
        `Total: ${money(row.subtotal)}${row.delivery_method === 'delivery' ? ' + delivery' : ''}`,
        '',
        `Customer: ${row.customer_name}`,
        `Phone: ${row.phone}`,
        row.email ? `Email: ${row.email}` : null,
        delivery,
        `Payment: ${payment}`,
        '',
        'Items:',
        ...row.items.map((i) => `• ${i.qty} x ${i.name} (size ${i.size}) ${money(i.price * i.qty)}`),
        row.notes ? `\nNote: ${row.notes}` : null,
        SITE_URL ? `\nManage: ${SITE_URL}/admin.html` : null,
    ].filter((l) => l !== null).join('\n');
}

function escapeHtmlText(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function orderAlertHtml(row) {
    const money = (n) => '$' + Number(n).toFixed(2).replace(/\.00$/, '');
    const isDelivery = row.delivery_method === 'delivery';
    const payment = { ecocash: 'EcoCash', bank: 'Bank transfer', cash: 'Cash' }[row.payment_method] || row.payment_method;
    let wa = String(row.phone || '').replace(/\D/g, '');
    if (wa.startsWith('0')) wa = '263' + wa.slice(1);
    const waText = encodeURIComponent(`Hi ${String(row.customer_name).split(' ')[0]}, this is Sky Smart. Thank you for your order ${row.code}!`);
    const cell = 'padding:8px 0;border-bottom:1px solid #eee;';
    const rows = row.items.map((i) => `<tr><td style="${cell}">${i.qty} × ${escapeHtmlText(i.name)} <span style="color:#667">(size ${escapeHtmlText(i.size)})</span></td>` +
        `<td style="${cell}text-align:right;font-weight:700">${money(i.price * i.qty)}</td></tr>`).join('');
    const line = (label, value) => `<tr><td style="padding:4px 12px 4px 0;color:#667;white-space:nowrap">${label}</td><td style="padding:4px 0;font-weight:600">${value}</td></tr>`;
    return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
  <div style="background:#0f1f4b;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0;border-bottom:3px solid #d4ad55">
    <div style="color:#f3e3b8;font-size:12px;letter-spacing:2px;text-transform:uppercase">New order</div>
    <div style="font-size:24px;font-weight:800;margin-top:4px">${escapeHtmlText(row.code)} · ${money(row.subtotal)}${isDelivery ? ' + delivery' : ''}</div>
  </div>
  <div style="border:1px solid #e6e8ee;border-top:none;padding:20px 24px;border-radius:0 0 14px 14px">
    <table style="border-collapse:collapse;font-size:15px">
      ${line('Customer', escapeHtmlText(row.customer_name))}
      ${line('Phone', `<a href="tel:${escapeHtmlText(row.phone)}">${escapeHtmlText(row.phone)}</a>`)}
      ${row.email ? line('Email', escapeHtmlText(row.email)) : ''}
      ${line(isDelivery ? 'Deliver to' : 'Delivery', isDelivery ? escapeHtmlText([row.address, row.city].filter(Boolean).join(', ')) + ' <span style="color:#9a5b00">(fee to confirm)</span>' : 'Collection in Bulawayo')}
      ${line('Payment', escapeHtmlText(payment))}
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:16px">${rows}
      <tr><td style="padding:10px 0;font-weight:800">Total</td><td style="padding:10px 0;text-align:right;font-weight:800;color:#0f1f4b">${money(row.subtotal)}${isDelivery ? ' + delivery' : ''}</td></tr>
    </table>
    ${row.notes ? `<p style="background:#fff8e6;border:1px solid #f0d9a0;padding:10px 12px;border-radius:10px">Note: ${escapeHtmlText(row.notes)}</p>` : ''}
    <p style="margin-top:20px">
      <a href="https://wa.me/${wa}?text=${waText}" style="background:#25d366;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;margin:0 8px 8px 0">WhatsApp the customer</a>
      ${SITE_URL ? `<a href="${SITE_URL}/admin.html" style="background:#0f1f4b;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">Open orders dashboard</a>` : ''}
    </p>
  </div>
</div>`;
}

async function sendEmailAlert(row) {
    if (!RESEND_API_KEY || !OWNER_EMAIL) return;
    try {
        const res = await fetch(RESEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: ALERT_FROM,
                to: [OWNER_EMAIL],
                subject: `🛍️ New order ${row.code}: $${Number(row.subtotal)} from ${row.customer_name}`,
                html: orderAlertHtml(row),
                text: orderAlertText(row),
            }),
            signal: AbortSignal.timeout(20000),
        });
        const body = await res.text();
        if (!res.ok) console.error(`Email order alert for ${row.code} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
        else console.log(`📧 Email alert sent for ${row.code} to ${OWNER_EMAIL}`);
    } catch (err) {
        console.error(`Email order alert for ${row.code} failed:`, err.message);
    }
}

function notifyOwnerOfOrder(row) {
    sendEmailAlert(row);
    sendWhatsAppAlert(row);
}

async function sendWhatsAppAlert(row) {
    if (!CALLMEBOT_APIKEY || !OWNER_WHATSAPP) return;
    const url = `${CALLMEBOT_URL}?phone=%2B${OWNER_WHATSAPP}` +
        `&text=${encodeURIComponent(orderAlertText(row))}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        const body = await res.text();
        // CallMeBot answers with an HTML page saying "Message queued" on success
        if (!res.ok || !/queued|sent/i.test(body)) {
            console.error(`WhatsApp order alert for ${row.code} may have failed: HTTP ${res.status} ${body.replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
        } else {
            console.log(`📲 WhatsApp alert sent for ${row.code}`);
        }
    } catch (err) {
        console.error(`WhatsApp order alert for ${row.code} failed:`, err.message);
    }
}

function publicOrder(row) {
    return {
        code: row.code,
        status: row.status,
        customerName: row.customer_name,
        deliveryMethod: row.delivery_method,
        city: row.city,
        paymentMethod: row.payment_method,
        items: row.items,
        subtotal: Number(row.subtotal),
        currency: row.currency,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

app.post('/api/orders', async (req, res) => {
    if (!dbReady) {
        return res.status(503).json({ success: false, message: 'Ordering is temporarily unavailable. Please order on WhatsApp.' });
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const recent = (recentOrdersByIp.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 5) {
        return res.status(429).json({ success: false, message: 'Too many orders from this device. Please wait a few minutes or contact us on WhatsApp.' });
    }
    const { order, error } = validateOrder(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    try {
        let row;
        for (let attempt = 0; attempt < 5 && !row; attempt++) {
            try {
                const result = await pool.query(
                    `INSERT INTO orders (code, customer_name, phone, email, delivery_method, address, city, payment_method, notes, items, subtotal)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
                    [newOrderCode(), order.customer_name, order.phone, order.email, order.delivery_method, order.address,
                        order.city, order.payment_method, order.notes, JSON.stringify(order.items), order.subtotal]
                );
                row = result.rows[0];
            } catch (err) {
                if (err.code !== '23505') throw err; // retry only on duplicate code
            }
        }
        recent.push(now);
        recentOrdersByIp.set(ip, recent);
        console.log(`🛍  New order ${row.code}: $${row.subtotal} via ${row.payment_method}`);
        notifyOwnerOfOrder(row); // fire-and-forget; never delays or fails the customer's order
        res.status(201).json({ success: true, order: publicOrder(row) });
    } catch (err) {
        console.error('Order save failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not place your order. Please try again or order on WhatsApp.' });
    }
});

// Customers look up their own order with the order number + the phone number used
app.get('/api/orders/:code', async (req, res) => {
    if (!dbReady) return res.status(503).json({ success: false, message: 'Order tracking is temporarily unavailable.' });
    const code = String(req.params.code || '').trim().toUpperCase();
    const digits = phoneDigits(req.query.phone);
    if (!/^SS-[A-Z0-9]{6}$/.test(code) || digits.length < 9) {
        return res.status(400).json({ success: false, message: 'Enter your order number (e.g. SS-7K2QX9) and phone number.' });
    }
    try {
        const { rows } = await pool.query('SELECT * FROM orders WHERE code = $1', [code]);
        const row = rows[0];
        // Compare the last 9 digits so 077..., +26377... and 26377... all match
        if (!row || phoneDigits(row.phone).slice(-9) !== digits.slice(-9)) {
            return res.status(404).json({ success: false, message: 'No order found with that number and phone.' });
        }
        res.json({ success: true, order: publicOrder(row) });
    } catch (err) {
        console.error('Order lookup failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not look up the order. Try again.' });
    }
});

function requireAdmin(req, res, next) {
    if (!ADMIN_KEY) return res.status(503).json({ success: false, message: 'Admin is not configured (set ADMIN_KEY).' });
    const given = Buffer.from(String(req.get('x-admin-key') || ''));
    const expected = Buffer.from(ADMIN_KEY);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return res.status(401).json({ success: false, message: 'Wrong admin key.' });
    }
    if (!dbReady) return res.status(503).json({ success: false, message: 'Database is not connected.' });
    next();
}

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
        const { rows } = await pool.query(
            `SELECT * FROM orders ${status ? 'WHERE status = $1' : ''} ORDER BY created_at DESC LIMIT 300`,
            status ? [status] : []
        );
        res.json({
            success: true,
            orders: rows.map((r) => ({ ...publicOrder(r), phone: r.phone, email: r.email, address: r.address, notes: r.notes, adminNote: r.admin_note })),
        });
    } catch (err) {
        console.error('Admin order list failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not load orders.' });
    }
});

app.patch('/api/admin/orders/:code', requireAdmin, async (req, res) => {
    const status = req.body && req.body.status;
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Unknown status.' });
    try {
        const { rows } = await pool.query(
            `UPDATE orders SET status = $1, admin_note = COALESCE($2, admin_note), updated_at = NOW() WHERE code = $3 RETURNING *`,
            [status, cleanString(req.body.note, 300), String(req.params.code).toUpperCase()]
        );
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found.' });
        res.json({ success: true, order: publicOrder(rows[0]) });
    } catch (err) {
        console.error('Admin order update failed:', err.message);
        res.status(500).json({ success: false, message: 'Could not update the order.' });
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
    console.log(`🔔 Order alerts: email ${RESEND_API_KEY ? 'ON → ' + OWNER_EMAIL : 'off (set RESEND_API_KEY)'}, ` +
        `WhatsApp ${CALLMEBOT_APIKEY ? 'ON → +' + OWNER_WHATSAPP : 'off (set CALLMEBOT_APIKEY)'}`);
});
