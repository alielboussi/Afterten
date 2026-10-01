# Fix aftertentransfers.app (still showing “Expo Go placeholder”)

Google sign-in is fine in Supabase. **Production is not running the portal yet.**

GitHub `master` still deploys a **static** site (`outputDirectory: public`) from commit `678ba9f`. The Next.js app under `afterten-orders/app/` is **only on your machine** until you push.

## 1. Push the portal to GitHub

From repo root:

```powershell
cd C:\Projects\Afterten
git add afterten-orders/app afterten-orders/lib afterten-orders/middleware.ts afterten-orders/next.config.ts afterten-orders/next-env.d.ts afterten-orders/mobile afterten-orders/package.json afterten-orders/package-lock.json afterten-orders/tsconfig.json afterten-orders/.env.example afterten-orders/.env.local.example afterten-orders/.gitignore docs supabase scripts package.json package-lock.json
git add -u afterten-orders
git status
git commit -m "Deploy Supabase Next.js portal; remove static Vercel placeholder."
git push origin master
```

(Do not commit `.env.local`, `secrets/`, or `afterten-orders/.next/`.)

## 2. Vercel project settings

| Setting | Value |
|---------|--------|
| Root Directory | `afterten-orders` |
| Framework Preset | **Next.js** (not “Other”) |
| Build Command | *(default)* `npm run build` |
| Output Directory | *(default — leave empty)* |

Remove any custom **Install** / **Build** commands that say “Static site — no build”.

## 3. Environment variables (Production + Preview) — required

Without these, `/login` errors and Google sign-in cannot finish.

- `NEXT_PUBLIC_SUPABASE_URL` — e.g. `https://ijaseteczrguoforksbl.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Project Settings → API → anon public
- `SUPABASE_SERVICE_ROLE_KEY` — server only (Portal admins page)

After adding or changing env vars, click **Redeploy** on the latest deployment.

## 4. Verify

- `https://aftertentransfers.app/login` → styled **Afterten Portal** login (not “Afterten Orders” placeholder).
- After Google → `/dashboard` (you are already in `portal_admins`).

Supabase **Redirect URLs**: `https://aftertentransfers.app/auth/callback` and `http://localhost:3000/auth/callback`.
