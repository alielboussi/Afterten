# Afterten Supervisor (Expo)

## Environment

Copy from the outlet app:

```bash
cp ../mobile/.env .env
```

Add for production push (after `eas init`):

- `EXPO_PUBLIC_EAS_PROJECT_ID` — from [expo.dev](https://expo.dev) project settings (also set in `app.config` via `extra.eas.projectId`).

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

## Google sign-in

Supabase → Authentication → URL configuration → redirect URL:

`afterten-supervisor://auth/callback`

## Icon preview

```bash
node ../../scripts/composite-supervisor-icon.mjs
# review supervisor-mobile/assets/icon-preview.png
node ../../scripts/composite-supervisor-icon.mjs --apply
```

## FCM / push (EAS)

1. `npm install -g eas-cli` and `eas login`
2. In this folder: `eas init` (links Expo project; add `projectId` to `app.json` under `expo.extra.eas`)
3. `eas credentials` → Android → set up **FCM V1** (upload Firebase `google-services.json` or let EAS create Firebase project)
4. Build: `eas build -p android --profile preview` (APK for testing) or `production` (Play Store AAB)
5. Install the build on a device — **Expo Go does not deliver production FCM pushes**; use a dev or preview build with `expo-notifications`.

Push delivery uses **Expo Push Service** (`exp.host`) → FCM on Android. Expo’s push API is **free**; FCM is **free** at typical volumes. **EAS Build** billing follows your Expo plan (free tier includes limited builds/month).

## Run locally

```bash
npm start
```
