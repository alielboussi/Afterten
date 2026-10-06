import { requirePortalAdmin, getCachedWelcomeName } from "@/lib/portal/require-portal-admin";
import { isPortalHistoryViewerEmail } from "@/lib/portal/portal-audit";
import { PortalShell } from "./PortalShell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePortalAdmin();
  const welcomeName = await getCachedWelcomeName(user.id, user.email ?? undefined);
  const showHistory = isPortalHistoryViewerEmail(user.email);

  return (
    <PortalShell welcomeName={welcomeName} showHistory={showHistory}>
      {children}
    </PortalShell>
  );
}
