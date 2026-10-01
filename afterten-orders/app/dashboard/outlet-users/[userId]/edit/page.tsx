import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCachedActiveOutlets,
  getCachedOutletStaffUser,
} from "@/lib/portal/outlet-data-cache";
import { OutletUserForm } from "../../OutletUserForm";
import styles from "@/app/dashboard/outlet-users/outlet-users.module.css";

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function EditOutletUserPage({ params }: Props) {
  const { userId } = await params;

  let outlets: Awaited<ReturnType<typeof getCachedActiveOutlets>> = [];
  let user: Awaited<ReturnType<typeof getCachedOutletStaffUser>> = null;
  let loadError: string | null = null;

  try {
    [outlets, user] = await Promise.all([
      getCachedActiveOutlets(),
      getCachedOutletStaffUser(userId),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load user.";
  }

  if (!loadError && !user) notFound();

  return (
    <div className="at-page-shell">
      <Link href="/dashboard/outlet-users" className="at-backLink">
        ← Back to Outlet Users
      </Link>
      <h1 className="at-page-title">Edit outlet user</h1>
      <p className="at-page-lead">Update alias, outlet, password, or active status.</p>

      {loadError ? (
        <p className="at-page-msgErr">{loadError}</p>
      ) : user ? (
        <section className="at-page-card">
          <OutletUserForm
            outlets={outlets}
            mode="edit"
            returnPath="/dashboard/outlet-users"
            initial={{
              userId: user.userId,
              email: user.email,
              alias: user.alias,
              outletId: user.outletId,
              outletName: user.outletName,
              active: user.active,
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
