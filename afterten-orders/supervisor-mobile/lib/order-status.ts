/** Display label for outlet_order_status in supervisor UI. */
export function formatSupervisorOrderStatus(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === "placed") return "Order-Placed";
  if (key === "accepted") return "Order Accepted";
  if (key === "loaded") return "Loaded";
  if (key === "completed") return "Completed";
  return status;
}
