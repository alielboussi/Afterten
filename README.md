# Afterten — Outlet Orders (Firebase + Expo Go)

Lightweight stack: **Firebase** backend, **Expo Go** mobile app, **Vercel** static landing only.

| Piece | Location |
|-------|----------|
| Firebase (Auth, Firestore, Functions, Storage) | [`firebase/`](firebase/) |
| Expo app (Expo Go) | [`afterten-orders/`](afterten-orders/) |
| Public site | [aftertentransfers.app](https://aftertentransfers.app/) → Vercel root **`afterten-orders`**, output **`public`** |

## Start here

1. **[docs/FIREBASE-PROJECT-SETUP.md](docs/FIREBASE-PROJECT-SETUP.md)** — new project, budget hard stop, deploy, seed outlet login.
2. **[docs/VERCEL.md](docs/VERCEL.md)** — domain + Vercel settings (no env vars needed today).
3. **[docs/OUTLET-APP-API.md](docs/OUTLET-APP-API.md)** — callable Functions for the app.

## Expo Go

```powershell
cd afterten-orders
copy .env.example .env
# fill EXPO_PUBLIC_FIREBASE_* from Firebase Console
npm install
npx expo start
```

## Cost rules

- No Cloud Scheduler / scheduled catalog sync.
- Run `node firebase/scripts/audit-no-schedulers.mjs` after every deploy.
- GCP budget with **disable billing at 100%**.
- Optional soft pause: Firestore `system/config.operationalPause`.

## Native Android app

There is **no Kotlin/Android orders project** under this repo or `C:\\Projects`. If you still have one elsewhere, delete that folder locally; we are rebuilding on **Expo Go** only.
