-- Production order notify webhook URL.
-- Set webhook_secret via Supabase SQL Editor to match ORDER_NOTIFY_WEBHOOK_SECRET on Vercel / .env.local
-- (Applied to production DB with URL https://aftertentransfers.app/api/webhooks/outlet-order-placed)

update public.order_notify_config
set
  webhook_url = 'https://aftertentransfers.app/api/webhooks/outlet-order-placed',
  updated_at = now()
where id = 'default';
