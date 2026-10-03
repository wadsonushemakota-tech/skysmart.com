# Sky Smart — Deploy checklist

Repo: [wadsonushemakota-tech/skysmart.com](https://github.com/wadsonushemakota-tech/skysmart.com)

Production layout:

| Layer | Host | Role |
|-------|------|------|
| Frontend | **Vercel** | Static HTML, CSS, images, React shop at `/store` |
| Backend | **Railway** | Express API, Socket.io chat, uploads |
| Database | **Supabase** (or local Postgres) | PostgreSQL |

---

## 1. Database

### Option A — Local (development)

1. **Start Docker Desktop** (must be running).
2. From the project folder:

   ```bash
   docker compose up -d
   node scripts/test-db.js
   ```

3. Your `.env` should match `docker-compose.yml`:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sky_smart
   NODE_ENV=development
   ```

4. Start the app: `npm start` → tables are created automatically on first connect.

### Option B — Supabase (production)

Supabase gives you the hosted PostgreSQL database **and** file storage for chat photos/voice notes
(Railway's own disk is wiped on every redeploy, so uploads must live elsewhere).

1. [Supabase](https://supabase.com/) → **New project**. Pick the region closest to your customers and save the database password.
2. **Connect** (top bar) → **Session pooler** → copy the URI. It looks like:

   ```env
   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```

   Use the **Session pooler**, not "Direct connection": the direct host is IPv6-only and Railway cannot reach it.
   Replace `[YOUR-PASSWORD]` with your database password (URL-encode special characters like `@` or `#`).
3. **Project Settings → API**: copy the **Project URL** and the **service_role** secret key:

   ```env
   SUPABASE_URL=https://[ref].supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...   # secret: server only, never in the frontend or GitHub
   ```

   The server creates a public `chat-media` bucket on first start.
4. Test from your machine: put these three values in `.env`, then

   ```bash
   node scripts/test-db.js
   ```

5. Copy your local data (users, products, chat history, and chat photos/voice notes) into Supabase.
   Docker Desktop must be running so the local database is reachable:

   ```bash
   node scripts/copy-db.js
   ```

   It copies from the local Docker DB to `DATABASE_URL`, and is safe to re-run (existing rows are skipped).
6. Set the same `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on **Railway** (next section).

### JWT secret

Generate once:

```bash
node scripts/generate-secrets.js
```

- **Local:** paste into `.env` as `JWT_SECRET=...`
- **Railway:** add `JWT_SECRET` in Variables (never commit it).

---

## 2. Railway (backend)

1. [Railway](https://railway.app/) → **New Project** → **Deploy from GitHub** → select `skysmart.com`.
2. **Variables** (Production):

   | Variable | Example |
   |----------|---------|
   | `NODE_ENV` | `production` |
   | `API_ONLY` | `1` |
   | `DATABASE_URL` | Supabase Session pooler URI |
   | `SUPABASE_URL` | `https://[ref].supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
   | `JWT_SECRET` | from `generate-secrets.js` |
   | `CORS_ORIGIN` | `https://skysmart-com.vercel.app` |
   | `TRUST_PROXY` | `1` |
   | `PUBLIC_URL` | `https://YOUR-SERVICE.up.railway.app` |
   | `STRIPE_SECRET_KEY` | optional |

3. **Settings → Networking → Generate domain**.
4. Verify: `https://YOUR-RAILWAY-URL/api/health` → `{"ok":true,...}`.

---

## 3. Vercel (frontend)

1. [Vercel](https://vercel.com/) → Import `wadsonushemakota-tech/skysmart.com`.
2. **Environment variable** (Production):

   ```env
   PUBLIC_API_URL=https://YOUR-RAILWAY-URL.up.railway.app
   ```

   No trailing slash. Must match the Railway public URL.

3. Build uses `vercel.json` → `npm run vercel-build`.
4. After deploy:
   - Home: `https://skysmart-com.vercel.app/`
   - Shop: `https://skysmart-com.vercel.app/store`

5. Update Railway `CORS_ORIGIN` if Vercel gives a different URL or you add a custom domain.

---

## 4. GitHub

Push from your machine:

```bash
git add .
git commit -m "Your message"
git push origin main
```

**Never commit:** `.env`, passwords, Stripe keys, Supabase URI with password.

---

## 5. Quick checks

| Check | Command / URL |
|-------|----------------|
| DB | `node scripts/test-db.js` |
| API | `GET /api/health` on Railway |
| Products | `GET /api/products` on Railway |
| Chat | Open home page → Community section; Socket.io uses `PUBLIC_API_URL` on Vercel |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `password authentication failed` | Wrong `DATABASE_URL` user/password |
| `Docker pipe` error | Start **Docker Desktop**, then `docker compose up -d` |
| Chat works locally but not on Vercel | Set `PUBLIC_API_URL` on Vercel + `CORS_ORIGIN` on Railway |
| Home page shows React app only | Ensure `vercel.json` only rewrites `/store`, not `/` |

---

## 6. Running the shop

### Orders dashboard

- Open `/admin.html` on the live site and sign in with the **`ADMIN_KEY`** set on the server (Render → Environment).
- New orders arrive as **Awaiting payment**. When the EcoCash / bank proof arrives on WhatsApp, press **Mark paid**,
  then **Mark ready** (collection) or **Mark on the way** (delivery), then **Mark completed**.
- **Message customer** opens WhatsApp with a ready-written message for the order's current status.
- Customers follow their order at `/track.html` with their order number + phone number.

### Adding or changing products

Products and prices live in **`catalog.js`** (used by the website *and* the server, so prices can't be tampered with):

1. Put the photo in `images/shop/` (square-ish, about 800px, JPG).
2. Copy an entry in `catalog.js`, give it a new unique `id`, name, price, category and image path.
3. Set `featured: true` to show it on the home page.
4. Commit and push: Vercel and Render redeploy automatically.

Payment details (EcoCash number, bank accounts) are in the `business` section at the bottom of `catalog.js`.
