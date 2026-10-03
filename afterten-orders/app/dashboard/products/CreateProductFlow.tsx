"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductForm } from "./ProductForm";
import { ProductVariantsEditor } from "./ProductVariantsEditor";
import styles from "./product-styles";

export function CreateProductFlow() {
  const router = useRouter();
  const [created, setCreated] = useState<{
    productDbId: string;
    parentProductId: string;
    hasVariants: boolean;
  } | null>(null);

  return (
    <>
      <section className="at-page-card">
        <ProductForm
          mode="create"
          returnPath="/dashboard/products"
          onCreated={(info) => {
            if (info.hasVariants) {
              setCreated({
                productDbId: info.id,
                parentProductId: info.productId,
                hasVariants: true,
              });
              return;
            }
            router.push("/dashboard/products");
          }}
        />
      </section>

      {created ? (
        <>
          <p className={styles.formHint} style={{ marginTop: 16, textAlign: "center" }}>
            Product saved. Add variant lines below, then return to the catalog when finished.
          </p>
          <section className="at-page-card" style={{ marginTop: 16 }}>
            <ProductVariantsEditor
              productDbId={created.productDbId}
              parentProductId={created.parentProductId}
              hasVariants={created.hasVariants}
            />
          </section>
          <p style={{ marginTop: 16, textAlign: "center" }}>
            <Link href="/dashboard/products" className="at-backLink">
              Done — back to Products
            </Link>
          </p>
        </>
      ) : null}
    </>
  );
}
