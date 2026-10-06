# Push notifications — outlet & supervisor apps (EAS builds)

Expo push **does not work in Expo Go** for production tokens. You need an **EAS build** (APK/AAB or iOS) with an **EAS project ID** and **FCM (Android) / APNs (iOS)** credentials.

## What each app receives

| App | When | Server trigger |
|-----|------|----------------|
| **Supervisor** | New outlet order placed | Portal `/api/webhooks/outlet-order-placed` → `supervisor_push_tokens` |
| **Outlet** | Order status `loaded` (ready to offload) | Portal `/api/webhooks/outlet-order-ready-offload` → `outlet_push_tokens` |

In-app supervisor toasts (Realtime) still work while the app is open; push covers background/closed.

---

## Prerequisites

1. [Expo account](https://expo.dev/signup)
2. EAS CLI: `npm install -g eas-cli` then `eas login`
3. Portal deployed at `https://aftertentransfers.app` with:
   - `ORDER_NOTIFY_WEBHOOK_SECRET` (matches Supabase `order_notify_config.webhook_secret`)
   - Offload webhook URL set in DB (migration `20261006140000_timeline_push_archive.sql`)

---

## Step 1 — Link each app to Expo (two projects)

Run **once per app folder** (separate slugs = separate push projects).

### Outlet app

```powershell
cd C:\Projects\Afterten\afterten-orders\mobile
eas init
```

- Choose **Create a new project** (or link existing).
- Confirm slug **`afterten-orders`**.

This adds to `app.json`:

```json
"extra": {
  "eas": {
    "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

If `eas init` does not write it, copy the project ID from [expo.dev](https://expo.dev) → your project → **Project settings** and add manually under `expo.extra.eas.projectId`.

### Supervisor app

```powershell
cd C:\Projects\Afterten\afterten-orders\supervisor-mobile
eas init
```

- Slug **`afterten-supervisor`**
- Add **`extra.eas.projectId`** the same way.

---

## Step 2 — Android package names (already in repo)

| App | `android.package` |
|-----|-------------------|
| Outlet | `com.afterten.orders` |
| Supervisor | `com.afterten.supervisor` |

Use these **exact** package names in Firebase / Play Console.

---

## Step 3 — Firebase + FCM (Android)

1. [Firebase Console](https://console.firebase.google.com/) → create or open a project.
2. **Add app** → Android → package `com.afterten.orders` → register.
3. Repeat for `com.afterten.supervisor` (same Firebase project is fine).
4. Firebase → **Project settings** → **Service accounts** → **Generate new private key** (JSON).

Upload FCM credentials to **each** Expo project:

```powershell
cd C:\Projects\Afterten\afterten-orders\mobile
eas credentials
```

- Platform: **Android**
- Profile: **preview** (or **production**)
- Follow prompts to upload the **FCM V1 service account JSON**

Repeat in `supervisor-mobile` for the supervisor Expo project.

---

## Step 4 — iOS (optional)

If you ship iOS:

```powershell
eas credentials
```

- Platform: **iOS**
- Upload **APNs key** (.p8) or let EAS generate one (Apple Developer account required).

Add to each `app.json`:

```json
"ios": {
  "bundleIdentifier": "com.afterten.orders"
}
```

(supervisor: `com.afterten.supervisor`)

---

## Step 5 — Build installable apps

### Android APK (internal testing)

```powershell
cd C:\Projects\Afterten\afterten-orders\mobile
eas build -p android --profile preview
```

```powershell
cd C:\Projects\Afterten\afterten-orders\supervisor-mobile
eas build -p android --profile preview
```

Download APKs from the Expo build page and install on devices.

### Production (Play Store)

```powershell
eas build -p android --profile production
eas submit -p android --profile production
```

---

## Step 6 — Register tokens on device

1. Install the **built** APK (not Expo Go).
2. Open app → sign in (outlet password / supervisor Google).
3. Tap **Allow** when asked for notifications.
4. Outlet: land on home after login. Supervisor: must be **approved** supervisor.

Verify in Supabase SQL:

```sql
select user_id, expo_push_token, platform, active, updated_at
from public.outlet_push_tokens
where active = true
order by updated_at desc
limit 10;

select user_id, expo_push_token, platform, active, updated_at
from public.supervisor_push_tokens
where active = true
order by updated_at desc
limit 10;
```

You should see `ExponentPushToken[...]` rows after a successful registration.

---

## Step 7 — End-to-end tests

### Supervisor — new order

1. Place an order from the **outlet** app (built APK).
2. Supervisor device should get push: **"New outlet order"** (if app backgrounded or killed).

Manual webhook (replace secret and order UUID):

```powershell
curl -s -X POST "https://aftertentransfers.app/api/webhooks/outlet-order-placed" `
  -H "Content-Type: application/json" `
  -H "x-order-notify-secret: YOUR_ORDER_NOTIFY_WEBHOOK_SECRET" `
  -d "{\"order_id\":\"ORDER-UUID-HERE\"}"
```

Response includes `"pushTokens": N` (should be > 0).

### Outlet — ready to offload

1. Complete supervisor **dispatch** so order status is **`loaded`**.
2. Outlet device gets **"Ready to offload"** push.

Or trigger DB webhook via handoff flow; offload push runs from `dispatch_outlet_offload_ready_push`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Missing EAS projectId` in app | Run `eas init`, add `expo.extra.eas.projectId`, rebuild |
| No row in `*_push_tokens` | Notifications denied, or still using Expo Go |
| `pushTokens: 0` from webhook | No registered tokens; reinstall build, sign in, allow notifications |
| Android no banner | Check channel **Orders**; disable battery optimization for the app |
| iOS no push | APNs credentials on EAS; correct `bundleIdentifier`; physical device (not simulator for some cases) |

---

## Env files (unchanged)

Both apps need `mobile/.env` / `supervisor-mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_PORTAL_URL=https://aftertentransfers.app
```

EAS builds: set the same vars under **Expo project → Secrets** or `eas env:create` for preview/production profiles.
