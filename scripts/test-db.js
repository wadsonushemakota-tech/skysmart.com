#!/usr/bin/env node
/**
 * Quick DATABASE_URL connectivity check.
 * Usage: node scripts/test-db.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
}

function sslConfig() {
    if (process.env.DATABASE_SSL === '0') return false;
    const lower = url.toLowerCase();
    if (lower.includes('supabase.co')) return { rejectUnauthorized: false };
    if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
    return false;
}

const pool = new Pool({ connectionString: url, ssl: sslConfig() });

(async () => {
    try {
        const res = await pool.query('SELECT NOW() AS now, current_database() AS db');
        console.log('Database OK');
        console.log('  database:', res.rows[0].db);
        console.log('  time:    ', res.rows[0].now);
        process.exit(0);
    } catch (err) {
        console.error('Database connection failed');
        console.error('  message:', err.message || err);
        if (url.includes('localhost')) {
            console.error('');
            console.error('Local Postgres tips:');
            console.error('  1. Start Docker Desktop, then: docker compose up -d');
            console.error('  2. Or install PostgreSQL and match DATABASE_URL in .env');
        } else if (url.includes('supabase.co')) {
            console.error('');
            console.error('Supabase tips:');
            console.error('  1. Supabase → Project Settings → Database → URI');
            console.error('  2. Replace [YOUR-PASSWORD] with your database password');
            console.error('  3. Use direct connection (port 5432) for this Node server');
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
