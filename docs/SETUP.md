# New Firebase project + budget hard stop

Do this **before** linking the Android app or deploying Functions.

## 1. Create the project

1. [Google Cloud Console](https://console.cloud.google.com/) → **New project** (e.g. `afterten-outlet-orders`).
2. [Firebase Console](https://console.firebase.google.com/) → **Add project** → select that GCP project.
3. **Authentication** → Sign-in method → enable **Email/Password**.
4. **Firestore** → Create database → **production mode** → **single region `us-central1` (Iowa)** — not multi-region; must match `firebase/functions/src/region.ts`.
5. **Storage** → Get started → same region as Firestore if possible.

## 2. Billing budget (stop spend, don’t accumulate)

Google does not offer a simple in-app “pause orders” tied to spend. Use **billing disable**:

1. [Billing → Budgets & alerts](https://console.cloud.google.com/billing/budgets) → **Create budget**.
2. Scope: **this project only**.
3. Amount: start low (e.g. **€15/month**), adjust after a week.
4. Alert thresholds: 50%, 90%, 100% → your email.
5. **Manage budget actions** → **Disable billing** for this project when spend hits **100%** of the budget.

When billing is disabled, Firestore, Functions, and Storage **stop** until you manually re-enable billing. That is the hard cap.

Optional: also set `system/config.operationalPause = true` in Firestore for a soft maintenance message (callables return `failed-precondition`).

## 3. Link this repo

1. `firebase/.firebaserc` → set `"default": "YOUR_PROJECT_ID"`.
2. Download **Android** `google-services.json` from Firebase project settings.
3. For admin scripts, create a service account with **Firebase Admin** / **Cloud Datastore User** and save JSON as e.g. `secrets/firebase-adminsdk.json` (never commit).

## 4. Deploy (minimal surface)

```powershell
cd C:\Projects\Afterten\firebase\functions
npm ci
npm run build
cd ..
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

**Do not** enable Cloud Scheduler. **Do not** add `onSchedule` functions.

Verify:

```powershell
node scripts/audit-no-schedulers.mjs
```

## 5. Shut down the old project

After the new app works, delete or disable billing on **`afterten-portal-system`** (old portal/middleware project) so it cannot spike again.

## 6. Operational pause (app-level)

Document `system/config`:

| Field | Purpose |
|-------|---------|
| `operationalPause` | `true` → all outlet callables reject with a clear message |
| `pauseMessage` | Shown to the app |

Set via Firebase Console or Admin SDK. This is independent of GCP billing disable.
