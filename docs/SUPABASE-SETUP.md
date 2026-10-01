# Supabase setup — Afterten outlet orders

No Google Cloud billing. **Expo Go + Supabase Auth, Postgres, Storage, RLS, RPCs.**

---

## 1. Create the project (Dashboard)

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. **Name:** e.g. `afterten-outlet-orders`.
3. **Database password:** strong (save in a password manager).
4. **Region:** pick **closest to Zambia** (e.g. **South Asia (Mumbai)** or **EU (Frankfurt)** — Supabase lists latency; no “closed billing account” surprises).
5. **Free plan** is enough to start (~25 outlets, ~30 orders/day).

---

## 2. Spend control (Supabase)

1. **Organization settings** → **Billing** → stay on **Free** until you outgrow limits.
2. Set **spend cap** / upgrade alerts if you move to **Pro** ($25/mo flat — predictable, unlike GCP runaway).
3. **Soft pause:** table `system_config.operational_pause = true` (no extra product needed).

---

## 3. Run the schema

1. Dashboard → **SQL Editor** → **New query**.
2. Paste full contents of:  
   `supabase/migrations/20261001120000_outlet_orders_core.sql`
3. **Run**.

Or split into chunks if the editor times out.

---

## 4. Storage buckets

1. **Storage** → create buckets:
   - `signatures` (private)
   - `orders` (private, for PDFs later)
2. **Policies:** start with “authenticated users read/write own outlet paths” when we wire the app; service role can manage via scripts until then.

---

## 5. Auth

1. **Authentication** → **Providers** → **Email** enabled (default).
2. Create users in **Authentication → Users** or via script after `secrets/supabase.env` exists.

---

## 6. Connect this repo (so Cursor can inspect data)

1. Copy `supabase.env.example` → **`secrets/supabase.env`** (gitignored).
2. Fill from **Project Settings → API**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server/scripts only — never Expo, never Vercel client)
3. For SQL queries from PC, add **Database → Connection string (URI)** as `SUPABASE_DB_URL`.

From repo root:

```powershell
npm install
node scripts/supabase/inspect.mjs
node scripts/supabase/query.mjs "select id, name from outlets limit 5"
```

Tell the assistant: **“supabase.env is ready”** — we can run inspect/query on your machine (not in the cloud on your behalf without that file).

---

## 7. Expo app env

In `afterten-orders/.env` (see updated `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 8. Vercel (`aftertentransfers.app`)

- Root: **`afterten-orders`**
- When the **portal** (Next.js) is added, set only **`NEXT_PUBLIC_SUPABASE_*`** on Vercel — **never** service role key.

---

## Firebase

The `firebase/` folder is **legacy / optional**. New work is **Supabase only** unless you explicitly revisit GCP.
