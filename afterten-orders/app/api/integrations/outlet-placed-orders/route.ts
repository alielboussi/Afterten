import { handleIntegrationOrdersGet } from "@/lib/integrations/integration-get-handler";

export const runtime = "nodejs";

/** GET /api/integrations/outlet-placed-orders — Bearer auth; orders at status placed. */
export async function GET(req: Request) {
  return handleIntegrationOrdersGet(req, "outlet_placed");
}
