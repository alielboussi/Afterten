export const dynamic = "force-dynamic";

export default function PortalReportsPage() {
  return (
    <div className="at-page-shell-table">
      <h1 className="at-page-title">Reports</h1>
      <p className="at-page-lead">
        Order reporting for portal admins. Run exports by single outlet or across all outlets — more
        report types will be added here.
      </p>
      <div className="at-page-card at-reportsPlaceholder">
        <h2 className="at-page-sectionTitle">Coming soon</h2>
        <ul className="at-reportsList">
          <li>Orders by outlet (date range, status)</li>
          <li>Multi-outlet summary (totals, line picks)</li>
          <li>Completed vs in-progress pipeline</li>
        </ul>
        <p className="at-orderIdMuted" style={{ marginTop: 12 }}>
          For live integration data today, use the supervisor accepted orders API (see team docs).
        </p>
      </div>
    </div>
  );
}
