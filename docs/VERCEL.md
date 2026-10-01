# Vercel — aftertentransfers.app

## Project settings

| Setting | Value |
|---------|--------|
| **Root directory** | `afterten-orders` |
| **Framework preset** | **Other** (not Next.js — this repo is Expo + static `public/`) |
| **Install command** | *(override in `vercel.json` — no-op)* |
| **Build command** | *(override in `vercel.json` — no-op)* |
| **Output directory** | `public` |
| **Production domain** | `https://aftertentransfers.app/` |

This deployment is intentionally **tiny**: a static landing page only. The **Expo Go** app talks **directly to Firebase** — not through Vercel.

## Environment variables on Vercel

**None required** for the current static site.

Do **not** put Firebase service account keys on Vercel. Expo uses **client** config via `EXPO_PUBLIC_*` in local `.env` or EAS Secrets when you ship builds later.

If you add a future web admin under this folder, add only the minimum public keys (`EXPO_PUBLIC_FIREBASE_*` or `NEXT_PUBLIC_*`), never the service role / admin SDK.

## Local preview of the static site

```powershell
cd C:\Projects\Afterten\afterten-orders
npx serve public
```

## Expo Go (separate from Vercel)

```powershell
cd C:\Projects\Afterten\afterten-orders
npm install
copy .env.example .env
# fill EXPO_PUBLIC_FIREBASE_* from Firebase Console → Web app
npx expo start
```

Scan the QR code with **Expo Go** on your phone.
