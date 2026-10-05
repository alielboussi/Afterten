# Afterten Supervisor (Expo)

## Environment

Copy from the outlet app:

```bash
cp ../mobile/.env .env
```

Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_PORTAL_URL` (e.g. `https://aftertentransfers.app`).

Portal / Vercel (order webhook + WhatsApp):

- `ORDER_NOTIFY_WEBHOOK_SECRET` — random string; must match Supabase `order_notify_config.webhook_secret`
- `WASENDER_API_KEY` — from WasenderAPI dashboard
- `WHATSAPP_ORDERS_GROUP_JID` — e.g. `120363xxxxxxxx@g.us`

Configure Supabase `order_notify_config` (service role SQL):

```sql
update public.order_notify_config
set
  webhook_url = 'https://YOUR_PORTAL_HOST/api/webhooks/outlet-order-placed',
  webhook_secret = 'same-as-ORDER_NOTIFY_WEBHOOK_SECRET',
  updated_at = now()
where id = 'default';
```

## New order alerts (in-app)

While a supervisor is signed in and approved, the app listens to **Supabase Realtime** on `outlet_orders` inserts and shows an in-app **toast** (`lib/order-realtime.ts`, `components/ToastBanner.tsx`). No Expo push, EAS project, or device notification permission is required.

WhatsApp group alerts still come from the portal webhook. Optional background push via EAS/FCM can be added later without changing this Realtime path.

## Google sign-in

Supervisor OAuth uses a **portal bridge** so Supabase never sends users to the website home (“Access not allowed” for non–portal-admins).

In **Supabase → Authentication → URL configuration → Redirect URLs**, supervisor sign-in needs **one** entry (wildcard covers `?app_return=` for Expo Go):

```
https://aftertentransfers.app/auth/supervisor-callback**
```

Keep **`https://aftertentransfers.app/auth/callback`** for portal website Google login. Add **`http://localhost:…/auth/callback`** only if you run the portal locally.

You do **not** need `exp://…`, `exp://**`, or `afterten-supervisor://…` in Supabase — those are handled by the bridge page, not by Supabase’s redirect allowlist.

Flow: Google → Supabase → `…/auth/supervisor-callback?app_return=<exp or custom scheme>` → app deep link → session in the Supervisor app only.

In Expo Go, copy the URLs from the login screen (dev) if sign-in fails.

## Icon preview

```bash
node ../../scripts/composite-supervisor-icon.mjs
# review supervisor-mobile/assets/icon-preview.png
node ../../scripts/composite-supervisor-icon.mjs --apply
```

## Optional: EAS builds (not required for Expo Go dev)

Use EAS when you need a standalone APK/AAB (not Expo Go):

1. `npm install -g eas-cli` and `eas login`
2. In this folder: `eas init` (links Expo project for builds only)
3. `eas build -p android --profile preview`

See `eas.json` for build profiles.

## Run locally

```bash
npm start
```
