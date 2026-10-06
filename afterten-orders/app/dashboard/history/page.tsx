import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalHistoryClient } from "./PortalHistoryClient";

export const dynamic = "force-dynamic";

export default async function PortalHistoryPage() {
  const supabase = await createClient();
  const { data: canView, error } = await supabase.rpc("is_portal_history_viewer");
  if (error || !canView) redirect("/dashboard");

  return (
    <div className="at-page-shell-table">
      <h1 className="at-page-title">History</h1>
      <p className="at-page-lead">
        Audit trail of every portal page view and admin action (add, edit, delete, send, and other
        changes) by all portal users.
      </p>
      <div className="at-page-card">
        <PortalHistoryClient />
      </div>
    </div>
  );
}
