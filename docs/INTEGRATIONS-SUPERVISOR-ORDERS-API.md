# Supervisor accepted orders API

Integration endpoint for systems that need supervisor-approved outlet order lines.

## Auth

```http
Authorization: Bearer YOUR_SECRET
```

**Local:** `Bearer Key.txt` at repo root (gitignored). **Production:** `SUPERVISOR_ACCEPTED_ORDERS_BEARER_KEY` on Vercel.

## Request

```http
GET /api/integrations/supervisor-accepted-orders?limit=25&since=2026-10-01T00:00:00Z&view=lines&detail=standard
```

| Query | Default | Description |
|--------|---------|-------------|
| `limit` | **25** | Orders per page (max **100**). Not row count. |
| `since` | — | ISO timestamp; only `supervisor_accepted_at >= since` |
| `cursor` | — | `next_cursor` from previous response |
| `view` | `lines` | `summary` = one row per order (no line expansion; includes `line_count`) |
| `detail` | `standard` | `compact` = UUIDs/qty only; `full` adds `line_total`, `units_per_order_unit`, `total_units` |
| `active_outlets_only` | `true` | Set `false` to include inactive outlets |

## Performance

- Paginate with **`limit` + `cursor`** (or `since` for incremental sync).
- Use **`view=summary`** for polling / backlog counts.
- Use **`detail=compact`** when names are already in your catalog.
- Default page size is small to limit Supabase reads; each page uses **batched** queries (orders → items → catalog maps), not per-line round trips.

## Response fields

Each record includes order header fields plus line fields when `view=lines`:

- Lifecycle: `order_placed_at`, `order_loaded_at`, `supervisor_accepted_at`, `supervisor_revised` (heuristic: order updated &gt;2s after accept)
- Finance: `grand_total`, `line_total` (`detail=full`)
- People: `employee_name`, `driver_id`, `driver_name`
- Outlet: `outlet_active`
- Stock: `units_per_order_unit`, `total_units` (`detail=full`)
- Idempotency: `line_item_id`
- Product / variant / auto-add columns (same as before)

`outlet_uuid` remains `null` (outlets use text `id`).

## Example sync loop

```bash
CURSOR=""
while true; do
  RESP=$(curl -s -H "Authorization: Bearer $KEY" \
    "https://aftertentransfers.app/api/integrations/supervisor-accepted-orders?limit=25&cursor=$CURSOR&detail=compact")
  echo "$RESP" | jq '.record_count'
  CURSOR=$(echo "$RESP" | jq -r '.next_cursor // empty')
  [ -z "$CURSOR" ] && break
done
```
