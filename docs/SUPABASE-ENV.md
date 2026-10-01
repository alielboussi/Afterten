# Connect Supabase to this repo (for Cursor + local scripts)

File: **`C:\Projects\Afterten\secrets\supabase.env`** (gitignored — never commit, never paste in chat).

---

## Step 1 — Open the file

In Cursor, open:

`secrets/supabase.env`

(Already created from the template; replace every placeholder.)

---

## Step 2 — API keys (required)

Supabase Dashboard → **Afterten-Orders** → **Project Settings** (gear) → **API**

| Variable in `.env` | Copy from Dashboard |
|--------------------|---------------------|
| `SUPABASE_URL` | **Project URL** → `https://xxxxxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | **Project API keys** → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys** → `service_role` `secret` (click Reveal) |

Example shape (fake values):

```env
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Save the file.**

---

## Step 3 — Database URI (optional but recommended for SQL)

Same project → **Project Settings** → **Database** → **Connection string**

1. Tab **URI**
2. Mode: **Transaction pooler** (port **6543**) — good for scripts
3. Copy the URI; replace `[YOUR-PASSWORD]` with the **database password** you set when creating the project

Paste as one line:

```env
SUPABASE_DB_URL=postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

(Mumbai projects use `ap-south-1` in the host — use whatever Supabase shows you.)

---

## Step 4 — Run migration (if not done yet)

**SQL Editor** → paste full file:

`supabase/migrations/20261001120000_outlet_orders_core.sql` → **Run**

---

## Step 5 — Verify (you or Cursor)

```powershell
cd C:\Projects\Afterten
npm run supabase:check
npm run supabase:inspect
```

Example query:

```powershell
npm run supabase:query -- "select id, operational_pause from system_config"
```

---

## Step 6 — Expo app (separate file)

`afterten-orders/.env` — **only** these two (anon key, not service role):

```env
EXPO_PUBLIC_SUPABASE_URL=<same as SUPABASE_URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
```

---

## Does Cursor connecting add Supabase cost?

**No special “AI fee”.** Running scripts uses the same API/database as you would in the Dashboard:

| Action | Usage impact |
|--------|----------------|
| `supabase:check` / `inspect` | A few REST requests per run — **negligible** on Free tier |
| `supabase:query` (SELECT) | Tiny DB compute — **negligible** for occasional admin queries |
| Normal app traffic | Dominated by **outlet apps** (reads/writes when live), not these checks |

Free tier includes **500 MB database**, **unlimited API requests** on current Supabase free plan (fair use), etc. Occasional inspect/query during setup **will not** push you toward paid by itself.

**What does cost later:** many users, heavy polling, large storage, or upgrading to **Pro ($25/mo)** by choice.

---

When `npm run supabase:check` passes, tell the assistant **“env ready”** — we can run inspect/query and browse table data on your machine without you posting keys.
