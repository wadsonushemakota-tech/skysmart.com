# Sky Smart Website

Fashion storefront and community site: static marketing pages, Express API, PostgreSQL, real-time chat (Socket.io), and a React PWA shop at `/store` with optional Stripe Checkout.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- PostgreSQL database ([Supabase](https://supabase.com/) works as a hosted Postgres)

## Setup (local, single server)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment sample and fill in values:

   ```bash
   cp .env.example .env
   ```

   - **Production:** set `JWT_SECRET`. Generate one with `node scripts/generate-secrets.js` (paste into `.env` or Railway; never commit it).
   - Set `DATABASE_URL` (local Postgres or Supabase URI from **Project Settings → Database**).
   - Optional: `STRIPE_SECRET_KEY`, `CORS_ORIGIN`, `TRUST_PROXY=1` behind a proxy.

3. Build the React/PWA bundle (needed for `/store`):

   ```bash
   npm run build
   ```

4. Start the server:

   ```bash
   npm start
   ```

   - Site: `http://localhost:3000`
   - Shop: `http://localhost:3000/store`
   - API health: `http://localhost:3000/api/health`

## Split deploy: Vercel (frontend) + Railway (backend) + Supabase (database)

This is the recommended layout for production: Vercel serves static HTML/CSS/JS and the webpack `dist/` bundle; Railway runs `server.js` (REST + Socket.io + uploads); Supabase hosts Postgres only (this app keeps its own JWT + bcrypt users in PostgreSQL—you do **not** need to enable Supabase Auth unless you plan to migrate to it later).

### 1. Supabase

1. Create a project → **Project Settings → Database**.
2. Copy the **URI** connection string (use the direct/session mode on port **5432** for a long-lived Node server).
3. Replace `[YOUR-PASSWORD]` with the database password.

### 2. Railway (API)

1. New project → **Deploy from GitHub** (this repo).
2. Add a **Redis**-less service: only the Node web service is required.
3. **Variables** (example):

   | Variable | Value |
   |----------|--------|
   | `NODE_ENV` | `production` |
   | `API_ONLY` | `1` |
   | `DATABASE_URL` | Supabase URI |
   | `JWT_SECRET` | output of `node scripts/generate-secrets.js` |
   | `CORS_ORIGIN` | `https://your-app.vercel.app` (comma-separate if you add a custom domain) |
   | `TRUST_PROXY` | `1` |
   | `PUBLIC_URL` | `https://YOUR-SERVICE.up.railway.app` (your Railway **public** URL; used for Stripe fallback URLs) |
   | `STRIPE_SECRET_KEY` | optional, `sk_live_...` or test key |

4. **Settings → Networking:** generate a public domain.
5. Deploy. Check `GET https://YOUR-RAILWAY-URL/api/health` → `{ "ok": true, ... }`.

`API_ONLY=1` turns off serving the static marketing site from Express (Vercel handles that). Chat uploads still live under `/uploads/...` on Railway.

### 3. Vercel (static site + `/store`)

1. Import the same GitHub repo.
2. **Environment variables** (Production):

   - `PUBLIC_API_URL` = `https://YOUR-SERVICE.up.railway.app` (no trailing slash; must match the URL the browser will call for `/api/*` and Socket.io).

3. Build settings are read from `vercel.json` (`npm run vercel-build` writes `api-config.js` and builds webpack).

4. After deploy, open your Vercel URL and confirm the shop at `/store`.

### 4. CORS and real-time chat

- `CORS_ORIGIN` on Railway must include your Vercel origin (`https://....vercel.app` and any custom domain).
- Socket.io uses the same `PUBLIC_API_URL` / `api-config.js` as HTTP; ensure Railway’s public URL supports WebSockets (default Railway domains do).

### Secrets

- Run **`node scripts/generate-secrets.js`** once; set `JWT_SECRET` on Railway only.
- Never commit `.env` or real URLs with passwords. Use `.env.example` as a template.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run `server.js` |
| `npm run build` | Production webpack build → `dist/` |
| `npm run vercel-build` | Writes `api-config.js` from `PUBLIC_API_URL` + webpack build (for Vercel) |
| `node scripts/generate-secrets.js` | Print a secure `JWT_SECRET` |
| `node scripts/write-api-config.js` | Regenerate `api-config.js` from `PUBLIC_API_URL` |

## License

MIT
