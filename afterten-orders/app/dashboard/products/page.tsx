import Link from "next/link";
import { getCachedProductsList } from "@/lib/portal/products-cache";
import { LiveQtyGateToggle } from "./LiveQtyGateToggle";
import { ProductImageUpload } from "./ProductImageUpload";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-ZM", { style: "currency", currency: "ZMW" }).format(value);
}

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
            <ul className="at-productGrid">
              {products.map((p) => (
                <li key={p.id} className="at-productCard">
                  <div className="at-product-cardMedia">
                    <ProductImageUpload
                      productDbId={p.id}
                      imageUrl={p.imageUrl}
                      productName={p.name}
                      layout="card"
                    />
                  </div>
                  <div className="at-productCardBody">
                    <h3 className="at-productCardTitle">{p.name}</h3>
                    <p className="at-productCardUuid" title={p.productId}>
                      {p.productId}
                    </p>
                    <dl className="at-productCardMeta">
                      <div className="at-productCardMetaRow">
                        <dt>UOM</dt>
                        <dd>{p.uom}</dd>
                      </div>
                      <div className="at-productCardMetaRow">
                        <dt>Price</dt>
                        <dd className="at-productCardPrice">{formatPrice(p.unitCost)}</dd>
                      </div>
                    </dl>
                    <div className="at-productCardActions">
                      <LiveQtyGateToggle productId={p.id} initialEnabled={p.liveQtyGateEnabled} />
                      <span className={p.active ? "at-badgeActive" : "at-badgeOff"}>
                        {p.active ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <Link href={`/dashboard/products/${p.id}/edit`} className="at-productCardEditBtn">
                      Edit product
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
