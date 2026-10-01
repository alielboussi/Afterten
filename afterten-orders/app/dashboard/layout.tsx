import { requirePortalAdmin, getCachedWelcomeName } from "@/lib/portal/require-portal-admin";
import { PortalShell } from "./PortalShell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePortalAdmin();
  const welcomeName = await getCachedWelcomeName(user.id, user.email ?? undefined);

  return <PortalShell welcomeName={welcomeName}>{children}</PortalShell>;
}
