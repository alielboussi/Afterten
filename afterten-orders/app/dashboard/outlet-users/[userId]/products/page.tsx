import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedOutletStaffUser } from "@/lib/portal/outlet-data-cache";
import { getCachedOutletProductAllowlist } from "@/lib/portal/outlet-product-allowlist-cache";
import { getCachedProductsList } from "@/lib/portal/products-cache";
import { OutletProductPicker } from "../../OutletProductPicker";
import styles from "../../outlet-users.module.css";

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function OutletUserProductsPage({ params }: Props) {
  const { userId } = await params;

  let user: Awaited<ReturnType<typeof getCachedOutletStaffUser>> = null;
  let products: Awaited<ReturnType<typeof getCachedProductsList>> = [];
  let allowlist: Awaited<ReturnType<typeof getCachedOutletProductAllowlist>> | null = null;
  let loadError: string | null = null;

  try {
    user = await getCachedOutletStaffUser(userId);
    if (user) {
      [products, allowlist] = await Promise.all([
        getCachedProductsList(),
        getCachedOutletProductAllowlist(user.outletId),
      ]);
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load data.";
  }

  if (!loadError && !user) notFound();

  const outletLabel = user?.alias?.trim() || user?.outletName || user?.outletId || "Outlet";

  return (
    <div className="at-page-shell-wide">
      <Link href="/dashboard/outlet-users" className="at-backLink">
        ← Back to Outlet Users
      </Link>
      <h1 className="at-page-title">Products for outlet</h1>
      <p className="at-page-lead">
        Control which catalog lines appear in the mobile app for this outlet location ({user?.outletId}).
      </p>

      {loadError ? (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("outlet_product_allowlist")
            ? " Run migration 20261001190000_outlet_product_allowlist.sql on Supabase."
            : null}
        </p>
      ) : user && allowlist ? (
        <section className="at-page-card">
          <OutletProductPicker
            outletId={user.outletId}
            outletLabel={outletLabel}
            products={products
              .filter((p) => p.active)
              .map((p) => ({
                productId: p.productId,
                name: p.name,
                uom: p.uom,
                unitCost: p.unitCost,
                imageUrl: p.imageUrl,
              }))}
            usesCustomAllowlist={allowlist.usesCustomAllowlist}
            initialAllowedProductIds={allowlist.allowedProductIds}
            returnPath="/dashboard/outlet-users"
          />
        </section>
      ) : null}
    </div>
  );
}
