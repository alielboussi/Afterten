import Link from "next/link";
import { getCachedActiveOutlets } from "@/lib/portal/outlet-data-cache";
import { OutletUserForm } from "../OutletUserForm";
import page from "@/app/dashboard/dashboard-page.module.css";
import styles from "@/app/dashboard/outlet-users/outlet-users.module.css";

export default async function NewOutletUserPage() {
  let outlets: Awaited<ReturnType<typeof getCachedActiveOutlets>> = [];
  let loadError: string | null = null;
  try {
    outlets = await getCachedActiveOutlets();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load outlets.";
  }

  return (
    <div className={page.pageShell}>
      <Link href="/dashboard/outlet-users" className={styles.backLink}>
        ← Back to Outlet Users
      </Link>
      <h1 className={page.pageTitle}>Create outlet user</h1>
      <p className={page.lead}>
        New Expo login with email and password. They cannot use Google or this portal.
      </p>

      {loadError ? (
        <p className={page.msgErr}>{loadError}</p>
      ) : (
        <section className={page.card}>
          <OutletUserForm outlets={outlets} mode="create" returnPath="/dashboard/outlet-users" />
        </section>
      )}
    </div>
  );
}
