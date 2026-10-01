# Cost guardrails — ~25 outlets, ~30 orders/day

Target: **stay under $10/month** with **no runaway billing**. Architecture + GCP budget, not hope.

---

## Do you need Blaze?

| Phase | What you run | Blaze? |
|-------|----------------|--------|
| **1 — Now** | Firestore + Auth + Storage only | Often **Spark is enough** until you deploy Functions |
| **2 — Later** | Deploy the **8** callables in `functions/src/index.ts` | **Blaze required** |

**Your old ~$680 bill was almost certainly not “place order once per request.”** Typical causes:

- Scheduled functions (e.g. catalog sync **every minute**)
- Dozens of deployed functions from an old monorepo deploy
- Public HTTP endpoints hammered by bots
- High memory / long timeouts on functions that scan whole collections

This repo has **no schedules**, **6 source files**, and **8 named callables only**. Run:

```powershell
node firebase/scripts/audit-no-schedulers.mjs
node firebase/scripts/audit-expected-functions.mjs
```

After any deploy: `firebase functions:list` must match that list — **delete anything else** in GCP Console → Cloud Functions.

**If you want $0 Functions risk:** stay on Phase 1 (Firestore rules + client SDK only) until the Expo UI is ready; we can add callables in one controlled deploy.

---

## Hard stop at ~$10 (does not keep accruing)

Google will **not** auto-cap spend while keeping the project running. Use **budget + disable billing**:

1. [Billing → Budgets](https://console.cloud.google.com/billing/budgets) → **Create budget**.
2. Scope: **your Firebase project only**.
3. **Budget amount: $10 USD / month** (or € equivalent if your billing account uses EUR).
4. **Alert thresholds:** 50%, 90%, 100% → your email.
5. **Budget action:** **Disable billing on this project** when **actual spend ≥ 100%** of budget.

**Effect:** Billable services **stop** (Functions, Firestore writes, Storage uploads fail). Spend **does not** continue into hundreds. You re-enable billing manually after review.

**Not the same as:** Firestore `system/config.operationalPause` — that is a **soft** app maintenance flag (callables return a friendly error). Use both: budget = financial kill switch; operationalPause = planned maintenance without touching billing.

---

## Cheapest Firestore location

**What actually costs more**

| Choice | Cost |
|--------|------|
| **Multi-region** Firestore (`eur3`, `nam5`, etc.) | **Higher** — avoid |
| **Single region** (any one: `us-central1`, `africa-south1`, `europe-west1`, …) | **Same Firestore read/write/delete price** (Standard edition) |
| Firestore in **region A**, Functions in **region B** | **Extra network egress** — avoid |

**What to pick**

1. In Firebase Console, choose **one single region** only (not “Multi-region”).
2. **Recommended default (cheapest overall pattern):** **`us-central1` (Iowa)** for **both** Firestore and Cloud Functions.
3. If staff are in Southern Africa and you want snappier apps **at the same Firestore price**, use **`africa-south1` (Johannesburg)** for **both** instead — still single-region, not more expensive per read/write.

4. Set the same ID in code: `firebase/functions/src/region.ts` → `FUNCTIONS_REGION` must **match** the Firestore location.

You **cannot change** Firestore region later without a new database — pick once, then align `region.ts`.

---

## Rough math at your scale

Assume **30 orders/day**, **25 outlets**, sensible app design:

| Activity | Order of magnitude / day | Firestore free tier (approx.) |
|----------|---------------------------|-------------------------------|
| Order writes (order + items + counter) | ~30 × ~5 writes ≈ **150 writes** | 20K writes/day free |
| Catalog reads (each outlet opens app 2×) | ~25 × 2 × ~50 lines ≈ **2.5K reads** if one query/line* | 50K reads/day free |

\* **One collection query** returning ~50 `catalog_lines` docs = **50 reads**, not 1. Still fine on free tier.

| Risk | What blows the bill |
|------|---------------------|
| Polling orders every 10s × 25 outlets | **Millions of reads/month** |
| Cloud Scheduler / sync jobs | **Was the old $20+/day problem** — never add |
| Callable on every catalog row | Use **one** `listOutletOrderCatalog` or client query, not N callables |

**Functions invocations:** 30 places + 30 completes + some lists ≈ **low thousands/month** — within free tier (2M invocations/month).

**Storage:** Small PNG signatures — cents unless huge files.

If you stay under free tiers, **Blaze invoice can be $0**; the **$10 budget** is still mandatory as a fuse.

---

## Code rules (already in this repo)

- **No** `onSchedule` / Cloud Scheduler (run `node firebase/scripts/audit-no-schedulers.mjs` after deploy).
- **Callables only** for writes; **Firestore rules** for outlet-scoped reads.
- **No** full-collection scans in Functions.
- **`STOCK_CATALOG_SYNC` / middleware** — not in this stack.

---

## Expo app rules (when we build UI)

1. **Catalog:** Load once per session (or cache 15–60 min); no background refresh loop.
2. **Pending orders:** Pull-to-refresh or **one** listener while screen is open; **no** global 15s poll when app is backgrounded.
3. **Place order:** One callable; upload signature **once** via signed URL.
4. **Images:** Compress signatures before upload; cap size (rules already limit Storage).
5. **Avoid** loading full order history on every screen open — paginate completed orders.

---

## After project creation (checklist)

1. Budget + **disable billing at 100%** ($10).
2. Deploy rules + functions only:  
   `firebase deploy --only firestore:rules,firestore:indexes,storage,functions`
3. Cloud Scheduler → **0 jobs** (all regions).
4. Seed outlets via script; import catalog in batches (one write per line, no sync cron).
5. Tell the assistant: **project ID** + service account JSON in `secrets/` (local only) to wire `.firebaserc` and verify data.

---

## If you get a billing alert

1. Billing → Reports → filter by SKU (Firestore Read, Functions, Storage).
2. Firestore → Usage tab → read spikes → find polling in app code.
3. Do **not** re-enable scheduled sync.
4. Fix app or rules, then re-enable billing if it was disabled.
