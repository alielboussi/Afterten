# Portal access control

Only emails listed in **`portal_admins`** can open `/dashboard`.

**Portal admins do not use the Expo outlet app.** They sign in on the web portal only. Outlet staff use separate accounts linked in **`app_profiles`**.

## How it works

- Table `portal_admins` (user_id + email, `active`)
- Table `app_profiles` (outlet staff → outlet id for Expo / Supabase RLS)
- RPC **`is_portal_admin()`** — Next.js middleware + dashboard
- RPC **`is_outlet_app_user()`** — Expo app should require this after login
- **`place_outlet_order`** and outlet RLS reject **`is_portal_admin()`** accounts
- **Make admin** (or seed script) removes any **`app_profiles`** row for that user
- **`portal_user_profiles.alias`** — display name in the portal header (editable on Portal admins)
- Click green **Portal admin** on that page to **revoke** (`active = false`); pill turns red **Revoked** and `/dashboard` is blocked via `is_portal_admin()`

## Add an admin (UI)

**Dashboard → Portal admins** lists everyone who has signed in with Google at least once. Click **Make admin**.

Requires `SUPABASE_SERVICE_ROLE_KEY` in `afterten-orders/.env.local` (server only) and on Vercel.

## Add an admin (CLI)

```powershell
cd C:\Projects\Afterten
npm run supabase:seed-portal-admin -- --email colleague@example.com
```

Or SQL Editor:

```sql
insert into portal_admins (user_id, email)
select id, email from auth.users where email = 'colleague@example.com'
on conflict (user_id) do update set active = true;
```

## Remove access

```sql
update portal_admins set active = false where email = 'someone@example.com';
-- or delete:
delete from portal_admins where email = 'someone@example.com';
```

## Apply migration (once per project)

SQL Editor: run migrations in order, including:

- `supabase/migrations/20261001140000_portal_admins.sql`
- `supabase/migrations/20261001150000_separate_portal_and_outlet_app.sql`

Or:

```powershell
node scripts/supabase/apply-sql-file.mjs supabase/migrations/20261001150000_separate_portal_and_outlet_app.sql
```
