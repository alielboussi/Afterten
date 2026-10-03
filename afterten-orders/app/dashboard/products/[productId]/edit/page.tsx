import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedProduct } from "@/lib/portal/products-cache";
import { ProductForm } from "../../ProductForm";
import { ProductVariantsEditor } from "../../ProductVariantsEditor";

type Props = {
  params: Promise<{ productId: string }>;
};

export default async function EditProductPage({ params }: Props) {
  const { productId: id } = await params;
  let product: Awaited<ReturnType<typeof getCachedProduct>> = null;
  let loadError: string | null = null;

  try {
    product = await getCachedProduct(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load product.";
  }

  if (!loadError && !product) notFound();

  return (
    <div className="at-page-shell">
      <Link href="/dashboard/products" className="at-backLink">
        ← Back to Products
      </Link>
      <h1 className="at-page-title">Edit product</h1>
      <p className="at-page-lead">Update catalog details or live qty gate settings.</p>

      {loadError ? (
        <p className="at-page-msgErr">{loadError}</p>
      ) : product ? (
        <section className="at-page-card">
          <ProductForm
            mode="edit"
            returnPath="/dashboard/products"
            initial={{
              id: product.id,
              productId: product.productId,
              name: product.name,
              uom: product.uom,
              unitCost: product.unitCost,
              imageUrl: product.imageUrl ?? "",
              active: product.active,
              liveQtyGateEnabled: product.liveQtyGateEnabled,
              sortOrder: product.sortOrder,
              qtyStep: product.qtyStep,
              minOrderQty: product.minOrderQty,
              maxOrderQty: product.maxOrderQty,
              hasVariants: product.hasVariants,
            }}
          />
        </section>
      ) : null}

      {product ? (
        <section className="at-page-card" style={{ marginTop: 16 }}>
          <ProductVariantsEditor
            productDbId={product.id}
            parentProductId={product.productId}
            hasVariants={product.hasVariants}
          />
        </section>
      ) : null}
    </div>
  );
}
