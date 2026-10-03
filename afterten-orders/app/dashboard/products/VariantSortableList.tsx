"use client";

import { useRef, useState } from "react";
import { reorderProductVariants } from "./variant-actions";
import { VariantImageUpload } from "./VariantImageUpload";
import styles from "./product-styles";

export type VariantListRow = {
  id: string;
  variant_id: string;
  name: string;
  uom: string;
  unit_cost: number;
  image_url: string | null;
  sort_order: number;
};

type Props = {
  parentProductId: string;
  rows: VariantListRow[];
  onRowsChange: (rows: VariantListRow[]) => void;
  onReload: () => Promise<void>;
  onEdit: (row: VariantListRow) => void;
  onDelete: (rowId: string) => void;
  reorderDisabled?: boolean;
  onReorderError?: (message: string) => void;
};

function reorderByDrag(list: VariantListRow[], draggedId: string, targetId: string): VariantListRow[] {
  const from = list.findIndex((r) => r.id === draggedId);
  const to = list.findIndex((r) => r.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((r, index) => ({ ...r, sort_order: index + 1 }));
}

export function VariantSortableList({
  parentProductId,
  rows,
  onRowsChange,
  onReload,
  onEdit,
  onDelete,
  reorderDisabled = false,
  onReorderError,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const orderAtDragStart = useRef<string[] | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  function onDragStart(rowId: string) {
    if (reorderDisabled || savingOrder) return;
    orderAtDragStart.current = rowsRef.current.map((r) => r.id);
    setDraggingId(rowId);
  }

  function onDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || reorderDisabled || savingOrder) return;
    if (draggingId === targetId) return;
    onRowsChange(reorderByDrag(rowsRef.current, draggingId, targetId));
  }

  async function onDragEnd() {
    const startOrder = orderAtDragStart.current;
    orderAtDragStart.current = null;
    setDraggingId(null);
    if (!startOrder || reorderDisabled) return;

    const newOrder = rowsRef.current.map((r) => r.id);
    if (startOrder.length === newOrder.length && startOrder.every((id, i) => id === newOrder[i])) {
      return;
    }

    setSavingOrder(true);
    const result = await reorderProductVariants(parentProductId, newOrder);
    setSavingOrder(false);

    if (!result.ok) {
      onReorderError?.(result.error);
      await onReload();
      return;
    }
  }

  return (
    <ul className={styles.variantList} aria-busy={savingOrder}>
      {rows.map((row) => {
        const dragging = draggingId === row.id;
        return (
          <li
            key={row.id}
            className={`${styles.variantListItem}${dragging ? ` ${styles.variantListItemDragging}` : ""}`}
            onDragOver={(e) => onDragOver(e, row.id)}
            onDrop={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className={styles.variantDragHandle}
              draggable={!reorderDisabled && !savingOrder}
              disabled={reorderDisabled || savingOrder}
              aria-label={`Drag to reorder ${row.name}`}
              title="Drag to reorder"
              onDragStart={() => onDragStart(row.id)}
              onDragEnd={() => void onDragEnd()}
            >
              <span aria-hidden>⋮⋮</span>
            </button>
            <VariantImageUpload
              variantRowId={row.id}
              parentProductId={parentProductId}
              variantId={row.variant_id}
              variantName={row.name}
              imageUrl={row.image_url}
              compact
              onUploaded={(url) =>
                onRowsChange(
                  rowsRef.current.map((r) => (r.id === row.id ? { ...r, image_url: url } : r)),
                )
              }
              onRemoved={() =>
                onRowsChange(
                  rowsRef.current.map((r) => (r.id === row.id ? { ...r, image_url: null } : r)),
                )
              }
            />
            <div className={styles.variantListMain}>
              <strong>{row.name}</strong>
              <span className={styles.variantMeta}>
                Sort {row.sort_order} · {row.variant_id.slice(0, 8)}… · {row.uom} · K
                {Number(row.unit_cost).toFixed(2)}
              </span>
            </div>
            <div className={styles.variantListActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => onEdit(row)}>
                Edit
              </button>
              <button type="button" className={styles.cancelBtn} onClick={() => void onDelete(row.id)}>
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
