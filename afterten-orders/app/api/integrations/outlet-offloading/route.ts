import { handleIntegrationOrdersGet } from "@/lib/integrations/integration-get-handler";

export const runtime = "nodejs";

/** GET /api/integrations/outlet-offloading — Bearer auth; completed orders with offloader signature URL. */
export async function GET(req: Request) {
  return handleIntegrationOrdersGet(req, "outlet_offloading");
}
