export type OffloadingLine = {
  item_id: string;
  product_id: string;
  parent_product_id: string;
  parent_name: string | null;
  is_variant: boolean;
  is_auto: boolean;
  name: string;
  qty: number;
  uom: string;
  line_total: number;
  sort_order: number;
};

export type OffloadingDisplayRow = {
  rowKey: string;
  kind: "main" | "parent" | "variant" | "auto";
  item_id: string | null;
  name: string;
  qty: number | null;
  uom: string;
  line_total: number | null;
};

export type OffloadingDisplayGroup = {
  groupKey: string;
  rows: OffloadingDisplayRow[];
};

type OrderRule = {
  trigger_product_id: string;
  added_product_id: string;
  qty_per_trigger_unit: number;
};

export function buildOffloadingDisplayGroups(
  lines: OffloadingLine[],
  rules: OrderRule[],
): OffloadingDisplayGroup[] {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  const manualLines = sorted.filter((l) => !l.is_auto);
  const autoLines = sorted.filter((l) => l.is_auto);
  const assignedAuto = new Set<string>();
  const groups: OffloadingDisplayGroup[] = [];
  const variantParentKeys = new Set<string>();

  for (const manual of manualLines) {
    if (manual.is_variant) {
      const parentKey = manual.parent_product_id || manual.product_id;
      let group = groups.find((g) => g.groupKey === parentKey);
      if (!group) {
        const parentLabel =
          manual.parent_name?.trim() ||
          manualLines.find(
            (m) => !m.is_variant && m.product_id === parentKey,
          )?.name ||
          manual.name;
        group = {
          groupKey: parentKey,
          rows: [
            {
              rowKey: `${parentKey}-parent`,
              kind: "parent",
              item_id: null,
              name: parentLabel,
              qty: null,
              uom: "",
              line_total: null,
            },
          ],
        };
        groups.push(group);
        variantParentKeys.add(parentKey);
      }
      group.rows.push({
        rowKey: `${manual.item_id}-variant`,
        kind: "variant",
        item_id: manual.item_id,
        name: manual.name,
        qty: manual.qty,
        uom: manual.uom,
        line_total: manual.line_total,
      });
      appendAutoRowsForTrigger(group.rows, manual, autoLines, assignedAuto, rules);
      continue;
    }

    const rows: OffloadingDisplayRow[] = [
      {
        rowKey: `${manual.item_id}-main`,
        kind: "main",
        item_id: manual.item_id,
        name: manual.name,
        qty: manual.qty,
        uom: manual.uom,
        line_total: manual.line_total,
      },
    ];
    appendAutoRowsForTrigger(rows, manual, autoLines, assignedAuto, rules);
    groups.push({ groupKey: manual.item_id, rows });
  }

  for (const auto of autoLines) {
    if (assignedAuto.has(auto.item_id)) continue;
    groups.push({
      groupKey: auto.item_id,
      rows: [
        {
          rowKey: `${auto.item_id}-auto`,
          kind: "auto",
          item_id: auto.item_id,
          name: auto.name,
          qty: auto.qty,
          uom: auto.uom,
          line_total: auto.line_total,
        },
      ],
    });
  }

  return groups;
}

function appendAutoRowsForTrigger(
  rows: OffloadingDisplayRow[],
  manual: OffloadingLine,
  autoLines: OffloadingLine[],
  assignedAuto: Set<string>,
  rules: OrderRule[],
): void {
  const triggerKeys = new Set(
    [manual.product_id, manual.parent_product_id].filter(Boolean).map((k) => k.toLowerCase()),
  );
  const addedProductIds = new Set(
    rules.filter((r) => triggerKeys.has(r.trigger_product_id)).map((r) => r.added_product_id),
  );

  for (const auto of autoLines) {
    if (assignedAuto.has(auto.item_id)) continue;
    if (!addedProductIds.has(auto.product_id)) continue;
    assignedAuto.add(auto.item_id);
    rows.push({
      rowKey: `${manual.item_id}-auto-${auto.item_id}`,
      kind: "auto",
      item_id: auto.item_id,
      name: auto.name,
      qty: auto.qty,
      uom: auto.uom,
      line_total: auto.line_total,
    });
  }
}

export function collectCheckableItemIds(groups: OffloadingDisplayGroup[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.item_id) ids.push(row.item_id);
    }
  }
  return ids;
}
