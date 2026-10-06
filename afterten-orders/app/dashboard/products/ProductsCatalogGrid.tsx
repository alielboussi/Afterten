"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductRow } from "@/lib/portal/product-types";
import { reorderCatalogProducts } from "./actions";
import { LiveQtyGateToggle } from "./LiveQtyGateToggle";
import { ProductImageUpload } from "./ProductImageUpload";
import { listProductVariants } from "./variant-actions";
import { VariantImageUpload } from "./VariantImageUpload";

type VariantPreview = {
  id: string;
  variant_id: string;
  name: string;
  uom: string;
  unit_cost: number;
  image_url: string | null;
  active: boolean;
};

type Props = {
  products: ProductRow[];
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-ZM", { style: "currency", currency: "ZMW" }).format(value);
}

function reorderByDrag(list: ProductRow[], draggedId: string, targetId: string): ProductRow[] {
  const from = list.findIndex((r) => r.id === draggedId);
  const to = list.findIndex((r) => r.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((row, index) => ({ ...row, sortOrder: index + 1 }));
}

export function ProductsCatalogGrid({ products: initialProducts }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [panelProductId, setPanelProductId] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantPreview[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const orderAtDragStart = useRef<string[] | null>(null);
  const productsRef = useRef(products);
  productsRef.current = products;

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  const panelProduct = products.find((p) => p.id === panelProductId) ?? null;

  const loadVariants = useCallback(async (productId: string) => {
    setPanelLoading(true);
    setPanelError(null);
    const result = await listProductVariants(productId);
    setPanelLoading(false);
    if (!result.ok) {
      setPanelError(result.error);
      setVariants([]);
      return;
    }
    setVariants(result.rows as VariantPreview[]);
  }, []);

  useEffect(() => {
    if (!panelProduct) {
      setVariants([]);
      return;
    }
    void loadVariants(panelProduct.productId);
  }, [panelProduct, loadVariants]);

  useEffect(() => {
    if (!panelProductId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanelProductId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelProductId]);

  function openPanel(product: ProductRow) {
    setPanelProductId((cur) => (cur === product.id ? null : product.id));
  }

  function onProductDragStart(rowId: string) {
    if (savingOrder) return;
    orderAtDragStart.current = productsRef.current.map((r) => r.id);
    setDraggingId(rowId);
  }

  function onProductDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || savingOrder) return;
    if (draggingId === targetId) return;
    setProducts(reorderByDrag(productsRef.current, draggingId, targetId));
  }

  async function onProductDragEnd() {
    const startOrder = orderAtDragStart.current;
    orderAtDragStart.current = null;
    setDraggingId(null);
    if (!startOrder) return;

    const newOrder = productsRef.current.map((r) => r.id);
    if (startOrder.length === newOrder.length && startOrder.every((id, i) => id === newOrder[i])) {
      return;
    }

    setSavingOrder(true);
    setReorderError(null);
    const result = await reorderCatalogProducts(newOrder);
    setSavingOrder(false);

    if (!result.ok) {
      setReorderError(result.error);
      setProducts(initialProducts);
    }
  }

  return (
    <>
      <p className="at-productReorderHint">
        Drag the <strong>⋮⋮</strong> handle to reorder how products appear in the outlet app.
        {savingOrder ? " Saving order…" : null}
      </p>
      {reorderError ? <p className="at-page-msgErr">{reorderError}</p> : null}

      {panelProductId ? (
        <button
          type="button"
          className="at-variantPopoverScrim"
          aria-label="Close variants"
          onClick={() => setPanelProductId(null)}
        />
      ) : null}

      <ul className="at-productGrid" aria-busy={savingOrder}>
        {products.map((p) => {
          const open = panelProductId === p.id;
          const dragging = draggingId === p.id;
          return (
            <li
              key={p.id}
              className={`at-productCard${open ? " at-productCard--panelOpen" : ""}${dragging ? " at-productCard--dragging" : ""}`}
              onDragOver={(e) => onProductDragOver(e, p.id)}
              onDrop={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className="at-productDragHandle"
                draggable={!savingOrder}
                disabled={savingOrder}
                aria-label={`Drag to reorder ${p.name}`}
                title="Drag to reorder"
                onDragStart={() => onProductDragStart(p.id)}
                onDragEnd={() => void onProductDragEnd()}
              >
                <span aria-hidden>⋮⋮</span>
              </button>
              <div className="at-product-cardMedia">
                <ProductImageUpload
                  productDbId={p.id}
                  imageUrl={p.imageUrl}
                  productName={p.name}
                  layout="card"
                />
                {p.hasVariants ? (
                  <button
                    type="button"
                    className={`at-productVariantsWedge${open ? " at-productVariantsWedge--open" : ""}`}
                    title="View variants"
                    aria-label={`View variants for ${p.name}`}
                    aria-expanded={open}
                    onClick={() => openPanel(p)}
                  />
                ) : null}
              </div>
              <div className="at-productCardBody">
                <h3 className="at-productCardTitle">{p.name}</h3>
                <p className="at-productCardUuid" title={p.productId}>
                  {p.productId}
                </p>
                <dl className="at-productCardMeta">
                  <div className="at-productCardMetaRow">
                    <dt>Sort</dt>
                    <dd>{p.sortOrder}</dd>
                  </div>
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
                  {p.hasVariants ? <span className="at-badgeVariants">Variants</span> : null}
                </div>
                <Link href={`/dashboard/products/${p.id}/edit`} className="at-productCardEditBtn">
                  Edit product
                </Link>
              </div>

              {open && panelProduct ? (
                <aside
                  className="at-variantPopover"
                  role="dialog"
                  aria-labelledby={`variant-popover-${p.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="at-variantPopoverHeader">
                    <h2 id={`variant-popover-${p.id}`} className="at-variantPopoverTitle">
                      {panelProduct.name}
                    </h2>
                    <button
                      type="button"
                      className="at-variantPopoverClose"
                      onClick={() => setPanelProductId(null)}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  <p className="at-variantPopoverLead">Tap photo to upload</p>
                  {panelLoading ? <p className="at-variantPopoverHint">Loading…</p> : null}
                  {panelError ? <p className="at-page-msgErr">{panelError}</p> : null}
                  {!panelLoading && !panelError && variants.length === 0 ? (
                    <p className="at-variantPopoverHint">No variants yet.</p>
                  ) : null}
                  <ul className="at-variantPopoverList">
                    {variants.map((v) => (
                      <li key={v.id} className="at-variantPopoverItem">
                        <VariantImageUpload
                          variantRowId={v.id}
                          parentProductId={panelProduct.productId}
                          variantId={v.variant_id}
                          variantName={v.name}
                          imageUrl={v.image_url}
                          compact
                          onUploaded={(url) =>
                            setVariants((prev) =>
                              prev.map((row) => (row.id === v.id ? { ...row, image_url: url } : row)),
                            )
                          }
                          onRemoved={() =>
                            setVariants((prev) =>
                              prev.map((row) => (row.id === v.id ? { ...row, image_url: null } : row)),
                            )
                          }
                        />
                        <div className="at-variantPopoverBody">
                          <strong>{v.name}</strong>
                          <span className="at-variantPopoverMeta">
                            {v.uom} · {formatPrice(Number(v.unit_cost))}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/dashboard/products/${panelProduct.id}/edit`}
                    className="at-variantPopoverEditLink"
                  >
                    Edit all
                  </Link>
                </aside>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
