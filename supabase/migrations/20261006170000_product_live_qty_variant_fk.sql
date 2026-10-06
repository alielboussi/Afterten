-- Allow live qty rows for variant inventory UUIDs (not only parent products.product_id).

alter table public.product_live_qty
  drop constraint if exists product_live_qty_product_id_fkey;

comment on table public.product_live_qty is
  'Live stock by inventory API UUID (parent product_id or variant_id). Synced via POST /api/integrations/product-live-qty.';
