import Link from "next/link";
import { getCachedProductsList } from "@/lib/portal/products-cache";
import { ProductsCatalogGrid } from "./ProductsCatalogGrid";

export default async function ProductsPage() {
  let products: Awaited<ReturnType<typeof getCachedProductsList>> = [];
  let loadError: string | null = null;

  try {
    products = await getCachedProductsList();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load products.";
  }

  return (
    <div className="at-page-shell-wide">
      <h1 className="at-page-title">Products</h1>
      <p className="at-page-lead">
        Master catalog for the outlet app — UOM, image, and price. Live qty gates stay off until the
        inventory API is connected.
      </p>

      {loadError && (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("has_variants")
            ? " Run migration 20261001220000_product_variants_hide_rule_additions.sql on Supabase."
            : loadError.includes("max_order_qty_days")
              ? " Run migration 20261004210000_max_order_qty_days.sql on Supabase."
              : loadError.includes("units_per_order_uom")
              ? " Run migration 20261004110000_units_per_order_uom.sql on Supabase."
              : loadError.includes("units_per_order_unit")
                ? " Run migration 20261004100000_units_per_order_unit.sql on Supabase."
              : loadError.includes("products") || loadError.includes("relation")
              ? " Run migration 20261001180000_products_catalog.sql on Supabase."
              : null}
        </p>
      )}

      {!loadError && (
        <section className="at-page-card at-products-catalog">
          <div className="at-listHeader">
            <h2 className="at-page-sectionTitle">Catalog</h2>
            <Link href="/dashboard/products/new" className="at-createBtn">
              Create new
            </Link>
          </div>

          {products.length === 0 ? (
            <p className="at-muted">No products yet. Click Create new to add one.</p>
          ) : (
            <ProductsCatalogGrid products={products} />
          )}
        </section>
      )}
    </div>
  );
}
