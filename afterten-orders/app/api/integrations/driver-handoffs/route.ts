import { handleIntegrationOrdersGet } from "@/lib/integrations/integration-get-handler";

export const runtime = "nodejs";

/** GET /api/integrations/driver-handoffs — Bearer auth; loaded orders with driver signature URL. */
export async function GET(req: Request) {
  return handleIntegrationOrdersGet(req, "driver_handoff");
}
