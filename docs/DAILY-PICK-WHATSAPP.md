# Daily pick summary WhatsApp (5:30 Kitwe)

Automated **bulk pick list** for the warehouse: one WhatsApp message to the orders group with **total quantities per product** summed across **all outlets**, for every order that is **supervisor accepted** and **not yet dispatched** (`status = accepted`).

## Schedule

| Kitwe (Africa/Lusaka) | UTC (Vercel cron) |
|----------------------|-------------------|
| **05:30** daily       | `30 3 * * *`      |

Configured in `afterten-orders/vercel.json`. Vercel invokes `GET /api/cron/daily-pick-summary`.

## Environment (Production)

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron runs |
| `WASENDER_API_KEY` | Same as order alerts |
| `WHATSAPP_ORDERS_GROUP_JID` | Same group as accept/dispatch alerts |
| `SUPABASE_SERVICE_ROLE_KEY` | Load accepted orders + lines |

Generate a long random `CRON_SECRET` (e.g. `openssl rand -hex 32`) and add it in Vercel → Settings → Environment Variables, then redeploy.

## Manual test (after deploy)

```powershell
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" `
  "https://aftertentransfers.app/api/cron/daily-pick-summary"
```

Response JSON includes `preview` (full message text) and `order_count`.

## Message rules

- Line quantities use the same **display qty** logic as order WhatsApp alerts (order rules / auto-adds).
- Products are **merged by catalog `product_id`** across outlets.
- Lines are sorted alphabetically by product name.
- If there are no accepted orders, a short “No accepted orders waiting to pick.” message is sent.

## Operations note

Once an order is **dispatched** (`loaded`), it drops out of the next morning’s summary. Accept orders before 05:30 Kitwe if they should appear in that day’s bulk pick.
