#!/usr/bin/env node
/**
 * Copies users, products and chat messages from one Postgres database to another
 * (e.g. local Docker -> Supabase), and moves chat photos/voice notes from uploads/chat
 * into Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 *
 * Usage:
 *   node scripts/copy-db.js                       # local Docker DB -> DATABASE_URL from .env
 *   node scripts/copy-db.js --from <url> --to <url>
 *
 * Safe to re-run: rows whose id (or unique email) already exists in the target are skipped.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { ensureSchema } = require('../db-schema');

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5432/sky_smart';
const TABLES = ['users', 'products', 'messages'];
const MEDIA_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.aac': 'audio/aac',
};

function arg(name) {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : undefined;
}

const fromUrl = arg('--from') || LOCAL_URL;
const toUrl = arg('--to') || process.env.DATABASE_URL;

function ssl(url) {
    if (process.env.DATABASE_SSL === '0') return false;
    return /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
}

function hostOf(url) {
    try { return new URL(url).host + new URL(url).pathname; } catch (e) { return '(invalid url)'; }
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BUCKET = (process.env.SUPABASE_BUCKET || 'chat-media').trim();

async function uploadMedia(localPath, fileName) {
    const headers = { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY };
    const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
    if (!bucketRes.ok) {
        const body = await bucketRes.text();
        if (!/already exists|Duplicate/i.test(body)) throw new Error(`bucket: HTTP ${bucketRes.status} ${body.slice(0, 200)}`);
    }
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/chat/${fileName}`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': MEDIA_TYPES[path.extname(fileName).toLowerCase()] || 'application/octet-stream',
            'x-upsert': 'true',
        },
        body: await fs.promises.readFile(localPath),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/chat/${fileName}`;
}

async function columnsOf(pool, table) {
    const res = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    return res.rows.map((r) => r.column_name);
}

(async () => {
    if (!toUrl) {
        console.error('No target database. Set DATABASE_URL in .env or pass --to <url>.');
        process.exit(1);
    }
    if (fromUrl === toUrl) {
        console.error('Source and target are the same database; nothing to do.');
        process.exit(1);
    }
    console.log(`From: ${hostOf(fromUrl)}`);
    console.log(`To:   ${hostOf(toUrl)}`);

    const source = new Pool({ connectionString: fromUrl, ssl: ssl(fromUrl) });
    const target = new Pool({ connectionString: toUrl, ssl: ssl(toUrl) });
    const useStorage = Boolean(SUPABASE_URL && SUPABASE_KEY);
    let mediaMoved = 0;
    const mediaMissing = [];

    try {
        const client = await target.connect();
        try {
            await ensureSchema(client);
        } finally {
            client.release();
        }

        for (const table of TABLES) {
            const targetCols = await columnsOf(target, table);
            const cols = (await columnsOf(source, table)).filter((c) => targetCols.includes(c));
            if (!cols.length) {
                console.log(`${table}: not in source, skipped`);
                continue;
            }
            const rows = (await source.query(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM ${table} ORDER BY id`)).rows;
            let inserted = 0;

            for (const row of rows) {
                if (table === 'messages' && row.media_url && row.media_url.startsWith('/uploads/chat/')) {
                    const fileName = row.media_url.slice('/uploads/chat/'.length);
                    const localPath = path.join(__dirname, '..', 'uploads', 'chat', fileName);
                    if (!useStorage) {
                        mediaMissing.push(fileName + ' (Supabase Storage not configured)');
                    } else if (!fs.existsSync(localPath)) {
                        mediaMissing.push(fileName + ' (file not found locally)');
                    } else {
                        row.media_url = await uploadMedia(localPath, fileName);
                        mediaMoved++;
                    }
                }
                const values = cols.map((c) => row[c]);
                const res = await target.query(
                    `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')})
                     VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')})
                     ON CONFLICT DO NOTHING`,
                    values
                );
                inserted += res.rowCount;
            }

            // Keep SERIAL ids ahead of the copied rows
            await target.query(
                `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1))`
            );
            console.log(`${table}: ${rows.length} in source, ${inserted} copied, ${rows.length - inserted} already there`);
        }

        if (useStorage) console.log(`chat media: ${mediaMoved} file(s) uploaded to Supabase Storage bucket "${BUCKET}"`);
        if (mediaMissing.length) {
            console.log(`chat media not moved (${mediaMissing.length}); these will not load online:`);
            mediaMissing.forEach((m) => console.log('  - ' + m));
        }
        console.log('Done.');
    } catch (err) {
        console.error('Copy failed:', err.message);
        process.exitCode = 1;
    } finally {
        await source.end();
        await target.end();
    }
})();
