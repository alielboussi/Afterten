#!/usr/bin/env node
/** Quick smoke test: generate PDF bytes for the latest Broadway order (local secrets). */
import { loadSupabaseEnv } from "./load-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { generateAndStoreOutletOrderPdf } from "../../afterten-orders/lib/integrations/outlet-order-pdf.ts";

const { url, serviceRoleKey } = loadSupabaseEnv();
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: order } = await admin
  .from("outlet_orders")
  .select("id, order_number")
  .eq("outlet_id", "BROA")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!order?.id) {
  console.error("No BROA order found");
  process.exit(1);
}

console.log("Testing PDF for", order.order_number, order.id);
const result = await generateAndStoreOutletOrderPdf(admin, order.id);
console.log(result);
