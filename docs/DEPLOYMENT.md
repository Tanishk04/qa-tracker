# Deployment guide

Step-by-step for getting QA Tracker onto a public URL via **Vercel** + **Supabase**. Free tier covers everything for a single user.

The whole walkthrough takes ~15 minutes assuming you already have Supabase + GitHub accounts.

---

## 1. Supabase project (one-time)

1. Sign in at <https://supabase.com> → **New project**.
2. Name it (e.g. `qa-tracker`), pick a strong DB password, choose the closest region. Wait ~1 min for provisioning.
3. **SQL Editor → New query** — paste & run **each** of these files in order. All are idempotent (safe to re-run):

   ```
   supabase/schema.sql
   supabase/migrations.sql
   supabase/migrations_002_security.sql
   supabase/migrations_003_release.sql
   supabase/migrations_004_setup.sql
   supabase/migrations_005_complexity_avatar.sql
   supabase/migrations_006_release_cycle.sql
   supabase/migrations_007_releases_picklist.sql
   ```

4. **Project Settings → API** — copy:
   - `Project URL` (e.g. `https://abcd.supabase.co`)
   - `anon public` key (long JWT or `sb_publishable_…` token)

5. **Database → Replication** — enable Realtime on tables: `user_stories`, `tasks`, `activity_logs`, `developers`, `app_settings`, `releases`.

6. **Authentication → Sessions** — for Notion/Linear-style "stay signed in":
   - JWT expiry: `3600` (1 hour, auto-refreshed silently in the background)
   - Refresh token reuse interval: `10`
   - Inactivity timeout: `0` (disabled)
   - Maximum session length: `0` or e.g. `2592000` (30 days) for a hard cap

7. **Authentication → Providers → Email** — turn off "Confirm email" if you want signup without a confirmation roundtrip (recommended for personal use). You can re-enable later.

---

## 2. Local check before deploy

```bash
git clone https://github.com/Tanishk04/qa-tracker.git
cd qa-tracker
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open <http://localhost:5173> → sign up → confirm the dashboard renders.

If anything breaks here, deploying won't fix it. Stop and fix first.

---

## 3. Vercel project

### 3a. Install + login

```bash
npm i -g vercel
vercel login
# opens a browser tab; auth and come back to the terminal
```

### 3b. Link the local folder to a Vercel project

From the project root:

```bash
vercel link
```

Answer the prompts:
- Set up and deploy? → **Y**
- Scope → your personal account
- Link to existing project? → **N**
- Project name → `qa-tracker` (or whatever you like)
- Directory → `./` (just press Enter)
- Override settings? → **N** (Vercel auto-detects Vite)

This writes a `.vercel/` folder with the project ID. It's gitignored.

### 3c. Set env vars

```bash
vercel env add VITE_SUPABASE_URL production
# paste your Supabase project URL when prompted

vercel env add VITE_SUPABASE_ANON_KEY production
# paste the anon key when prompted

# Repeat for preview deploys (so PR previews work too):
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_ANON_KEY preview
```

The values are stored encrypted by Vercel — never visible in plaintext in any log or response.

### 3d. First production deploy

```bash
vercel --prod
```

Output ends with the deployed URL: `https://qa-tracker-<your-handle>.vercel.app`. **Copy this URL** — you need it in step 4.

---

## 4. Update Supabase URL Configuration

This step is **required** for password-reset emails to land users on the deployed app instead of `localhost`.

In Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://qa-tracker-<your-handle>.vercel.app`
- **Redirect URLs**: add **both**:
  - `https://qa-tracker-<your-handle>.vercel.app`
  - `http://localhost:5173`

Save. Skipping this means reset-password emails 404 in production.

---

## 5. GitHub ↔ Vercel auto-deploy

Open <https://vercel.com/dashboard> → click your `qa-tracker` project → **Settings → Git** → connect the GitHub repo. Once linked:

- Push to `main` → production deploy (~30 s)
- Push to any branch → preview deploy with a unique `*-git-branch.vercel.app` URL

The CI workflow in `.github/workflows/ci.yml` runs `npm run type-check` and `npm run build` first; deploys only happen if CI passes.

---

## 6. Verify

Open the production URL in incognito:

- ✅ Sign up with a fresh email; sign in works
- ✅ Theme toggle smoothly cross-fades all colors (~380 ms)
- ✅ Setup → Stories tab; picklists readable in dark mode
- ✅ Click "Forgot password" → email arrives → link routes to the **Vercel** URL (not localhost) → set new password → signed in
- ✅ Browser console clean (no env-var-missing warnings, no 4xx)
- ✅ `git push origin main` triggers a new deploy; CI badge in README goes green

---

## Custom domain (optional, later)

1. **Vercel dashboard → Settings → Domains** → add your domain (e.g. `qa.yourdomain.com`).
2. Vercel shows the DNS records (CNAME or A/AAAA). Add them at your registrar.
3. ~10 min to propagate; HTTPS is automatic.
4. **Don't forget**: re-add the new domain to Supabase's Redirect URLs.

---

## Troubleshooting

**Blank page after deploy.** Check the browser console. Most common cause: missing env vars. Vercel → project → Settings → Environment Variables — confirm both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for `Production` and `Preview`. Trigger a new deploy after adding (`vercel --prod` or push a commit).

**Reset-password email 404s.** Supabase Site URL is still `localhost:5173`. Update it (step 4).

**CI fails on type-check.** Run `npm run type-check` locally — should match. If a transitive type changed in `node_modules`, lock the version in `package.json` and commit `package-lock.json`.

**Realtime updates lag.** Confirm step 1.5 (Replication enabled on each table). Reload the app — the channels resubscribe.

**Realtime updates duplicate.** You probably enabled Replication twice on the same table. Toggle one off.

**Passive time tracking off by hours.** Check the user's timezone in the browser vs. the activity_log timestamps (Postgres stores `timestamptz`). The interval math is timezone-agnostic, so a mismatch usually means a stale browser tab — close and reopen.

---

## Cost notes

Both the Supabase free tier (500 MB DB, 2 GB egress, 50 K MAU) and the Vercel hobby tier (100 GB bandwidth, unlimited deploys) are way more than a single-user QA tool will ever consume. Expected monthly cost: **$0**.
