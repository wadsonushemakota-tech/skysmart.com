#!/usr/bin/env node
/**
 * Prints a secure JWT_SECRET for Railway / .env (do not commit the value).
 * Usage: node scripts/generate-secrets.js
 */
const crypto = require('crypto');

const jwt = crypto.randomBytes(64).toString('base64url');
console.log('');
console.log('Add this to Railway (and .env locally if needed):');
console.log('');
console.log('JWT_SECRET=' + jwt);
console.log('');
