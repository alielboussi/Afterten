# Create the Firestore / Firebase project (cost-safe)

Do these steps **in order**. Do not deploy Functions until the **budget action** is in place.

---

## Phase 1 — New GCP + Firebase project

1. Open [Google Cloud Console](https://console.cloud.google.com/) with the Google account that should **own billing**.
2. **Select project** → **New project**
   - Name: e.g. `Afterten Outlet Orders`
   - Project ID: e.g. `afterten-outlet-orders` (note the ID — you will use it everywhere)
3. Open [Firebase Console](https://console.firebase.google.com/) → **Add project** → choose the GCP project you just created.
4. **Upgrade to Blaze** (pay-as-you-go) only if prompted for Functions or Storage — required for Cloud Functions. Firestore also needs billing on Blaze for production use beyond tiny free tier.

---

## Phase 2 — Enable only what you need

| Product | Action |
|---------|--------|
| **Authentication** | Sign-in → **Email/Password** → Enable |
| **Firestore** | Create database → **Production mode** → **single region** **`us-central1` (Iowa)** — not multi-region (see `functions/src/region.ts`; change both together if you pick another single region) |
| **Storage** | Get started → default bucket, prefer same region |
| **Functions** | Enabled automatically on first deploy from CLI |

**Do not enable:** Cloud Scheduler jobs, Extensions you do not need, Firestore **multi-region**, or duplicate databases.

**APIs to leave disabled** unless you need them later: anything unrelated to Auth, Firestore, Storage, Cloud Functions.

---

## Phase 3 — Budget alerts + hard stop (GCP)

Google’s console does **not** have a single “pause project” checkbox. You get the same effect with **budget actions**:

1. [Billing → Budgets & alerts](https://console.cloud.google.com/billing/budgets) → **Create budget**.
2. **Scope:** filter to **this project only** (`afterten-outlet-orders` or your ID).
3. **Amount:** start **€10–15 / month** (raise later if usage is stable and tiny).
4. **Alert thresholds:** e.g. **50%**, **90%**, **100%** → your email (+ backup email).
5. **Set budget actions** (or **Manage actions** on the budget):
   - Add action: **Disable billing for project** when **actual cost** exceeds **100%** of budget (or a fixed € amount you choose).
   - Confirm the warning: services **stop** until you manually re-enable billing — that prevents runaway charges.

Optional: connect a **Pub/Sub** topic on the budget for email/Slack automation (not required for the hard stop).

**Verify after setup:** Billing → Budgets shows your budget with an action listed as “Disable billing”.

---

## Phase 4 — App-level pause (Firestore “maintenance”)

Independent of GCP billing — for planned maintenance without disabling billing:

1. Firestore → document **`system/config`**
2. Fields:
   - `operationalPause`: `boolean` — set `true` to block outlet callables
   - `pauseMessage`: `string` — message shown in the Expo app
   - `updatedAt`: ISO timestamp

The seed script creates this doc with `operationalPause: false`. Toggle in Console when you need a soft pause.

---

## Phase 5 — Link this repo

1. Install [Firebase CLI](https://firebase.google.com/docs/cli) if needed.
2. In repo:

```powershell
cd C:\Projects\Afterten\firebase
copy .firebaserc.example .firebaserc
# Edit .firebaserc → set "default" to YOUR_PROJECT_ID
firebase login
firebase use YOUR_PROJECT_ID
```

3. Service account for local scripts only:
   - GCP → **IAM & Admin** → **Service accounts** → create key (JSON)
   - Save as `C:\Projects\Afterten\secrets\firebase-adminsdk.json` (never commit)

4. Deploy **rules + functions only** (no indexes churn unless needed):

```powershell
cd C:\Projects\Afterten\firebase\functions
npm ci
npm run build
cd ..
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

5. Safety check:

```powershell
node scripts/audit-no-schedulers.mjs
```

6. GCP → **Cloud Scheduler** → must show **0 jobs** in all regions.

7. Seed first outlet login:

```powershell
node scripts/seed-outlet-user.mjs --email outlet@example.com --password "ChangeMe!" --outlet-id OUTLET1 --outlet-name "Main Branch"
```

---

## Phase 6 — Expo app (Firebase client config)

1. Firebase Console → **Project settings** → **Your apps** → add **Web** app (used by Expo / Firebase JS SDK).
2. Copy the `firebaseConfig` object into `afterten-orders/.env` (see `afterten-orders/.env.example`) as `EXPO_PUBLIC_*` vars.
3. Run the app with **Expo Go** — no native `google-services.json` required for this stack.

**Vercel (`https://aftertentransfers.app/`)** hosts only the **light static site** in `afterten-orders/public` — **no Firebase secrets on Vercel** unless you later add a web admin. Mobile secrets stay in Expo env / EAS.

---

## Phase 7 — Shut down the old Firebase project

When the new stack works, **disable billing** or **delete** the old project (`afterten-portal-system`) so scheduled jobs and legacy Functions cannot charge you again.

---

## Cost discipline (keep in mind always)

- **No** `onSchedule` / Cloud Scheduler catalog sync — ever.
- Prefer **callable Functions** over polling; prefer **client reads** with tight rules over Function reads.
- Keep **indexes minimal**; avoid collection group scans.
- Run `audit-no-schedulers.mjs` after every deploy.
- Stay on **Spark** only if you drop Functions entirely; with Functions you need Blaze but keep budget disable at 100%.
