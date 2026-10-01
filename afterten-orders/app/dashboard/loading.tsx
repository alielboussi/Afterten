export default function DashboardLoading() {
  return (
    <div className="at-dash-loadingWrap" aria-live="polite" aria-busy="true">
      <div className="at-dash-loadingBar" />
      <p className="at-dash-loadingText">Loading…</p>
    </div>
  );
}
