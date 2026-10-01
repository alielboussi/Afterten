import page from "@/app/dashboard/dashboard-page.module.css";

export default function DashboardHomePage() {
  return (
    <div className={page.pageShell}>
      <h1 className={page.pageTitle}>Dashboard</h1>
      <p className={page.lead}>
        Use <strong>Outlet Users</strong> to create Expo app logins (email + password, alias per
        staff). Use <strong>Portal Admins</strong> for who can access this website (Google or email).
      </p>
    </div>
  );
}
