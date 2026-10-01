# Afterten — Outlet Orders (Supabase + Expo Go)

**Backend:** Supabase (Auth, Postgres, Storage, RLS, RPCs) — no Google Cloud required.

| Piece | Location |
|-------|----------|
| Database schema | [`supabase/migrations/`](supabase/migrations/) |
| Admin scripts (inspect / SQL) | [`scripts/supabase/`](scripts/supabase/) |
| Expo app (Expo Go) | [`afterten-orders/`](afterten-orders/) |
| Public site | [aftertentransfers.app](https://aftertentransfers.app/) → Vercel root **`afterten-orders`** |

## Start here

1. **[docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md)** — create project, run migration, connect `secrets/supabase.env`.
2. **[docs/VERCEL.md](docs/VERCEL.md)** — domain settings.

## Connect Cursor to your database

```powershell
copy supabase.env.example secrets\supabase.env
# fill keys from Supabase Dashboard
npm install
npm run supabase:inspect
```

Never commit `secrets/supabase.env`. Never put **service role** or **database URL** in Expo or Vercel client env.

## Expo Go

```powershell
cd afterten-orders
copy .env.example .env
npm install
npx expo start
```

## Legacy

[`firebase/`](firebase/) is unused for the Supabase path — ignore unless you return to GCP.
