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

1. [Supabase](https://supabase.com/) → New project.
2. **Project Settings → Database → Connection string → URI** (direct, port **5432**).
3. Replace `[YOUR-PASSWORD]` with your database password.
4. Set on **Railway** (not in GitHub):

   ```env
   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```

   Or use the **Session/Direct** URI from the dashboard if shown.

5. Test locally (optional): paste URI into `.env`, then `node scripts/test-db.js`.

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
   | `DATABASE_URL` | Supabase URI |
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
