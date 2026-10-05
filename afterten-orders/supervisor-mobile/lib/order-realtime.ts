import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKwacha } from "./currency";

type OrderInsertRow = {
  order_number?: string;
  outlet_name?: string;
  grand_total?: number;
};

export function formatNewOutletOrderMessage(row: OrderInsertRow): string {
  const orderNo = row.order_number ?? "New order";
  const outlet = row.outlet_name ?? "Outlet";
  const total = typeof row.grand_total === "number" ? formatKwacha(row.grand_total) : "";
  return total ? `${outlet}: ${orderNo} · ${total}` : `${outlet}: ${orderNo}`;
}

/** In-app alerts while supervisor is signed in (Supabase Realtime only). */
export function subscribeToNewOutletOrders(
  supabase: SupabaseClient,
  onNewOrder: (message: string) => void,
): () => void {
  const channel = supabase
    .channel("supervisor-outlet-orders")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "outlet_orders" },
      (payload) => {
        const row = payload.new as OrderInsertRow;
        onNewOrder(formatNewOutletOrderMessage(row));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
