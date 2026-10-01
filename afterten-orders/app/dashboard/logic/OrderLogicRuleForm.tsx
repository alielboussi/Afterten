"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOrderLogicRule,
  deleteOrderLogicRule,
  updateOrderLogicRule,
  updateProductOrderQtyLimits,
  type LogicAdditionInput,
} from "./actions";

export type ProductOption = {
  productId: string;
  name: string;
  uom: string;
  qtyStep: number;
  minOrderQty: number | null;
  maxOrderQty: number | null;
};

type Initial = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  triggerProductId: string;
  additions: LogicAdditionInput[];
};

type Props =
  | { mode: "create"; returnPath: string; products: ProductOption[]; initial?: undefined }
  | { mode: "edit"; returnPath: string; products: ProductOption[]; initial: Initial };

function emptyRow(): LogicAdditionInput {
  return { addedProductId: "", qtyPerTriggerUnit: 1 };
}

function fmtQty(n: number | null) {
  return n == null ? "" : String(n);
}

function limitsFromProduct(p: ProductOption | undefined) {
  return {
    qtyStep: String(p?.qtyStep ?? 1),
    minOrderQty: fmtQty(p?.minOrderQty ?? null),
    maxOrderQty: fmtQty(p?.maxOrderQty ?? null),
  };
}

export function OrderLogicRuleForm(props: Props) {
  const { mode, returnPath, products } = props;
  const router = useRouter();
  const isEdit = mode === "edit";

  const productById = useMemo(
    () => new Map(products.map((p) => [p.productId, p])),
    [products],
  );

  const initialTriggerId = isEdit
    ? props.initial.triggerProductId
    : (products[0]?.productId ?? "");

  const [name, setName] = useState(isEdit ? props.initial.name : "");
  const [description, setDescription] = useState(isEdit ? props.initial.description : "");
  const [active, setActive] = useState(isEdit ? props.initial.active : true);
  const [triggerProductId, setTriggerProductId] = useState(initialTriggerId);
  const [qtyStep, setQtyStep] = useState(() => limitsFromProduct(productById.get(initialTriggerId)).qtyStep);
  const [minOrderQty, setMinOrderQty] = useState(
    () => limitsFromProduct(productById.get(initialTriggerId)).minOrderQty,
  );
  const [maxOrderQty, setMaxOrderQty] = useState(
    () => limitsFromProduct(productById.get(initialTriggerId)).maxOrderQty,
  );
  const [additions, setAdditions] = useState<LogicAdditionInput[]>(
    isEdit && props.initial.additions.length > 0 ? props.initial.additions : [emptyRow()],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const limits = limitsFromProduct(productById.get(triggerProductId));
    setQtyStep(limits.qtyStep);
    setMinOrderQty(limits.minOrderQty);
    setMaxOrderQty(limits.maxOrderQty);
  }, [triggerProductId, productById]);

  function updateAddition(index: number, patch: Partial<LogicAdditionInput>) {
    setAdditions((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const payload = {
      name,
      description,
      active,
      sortOrder: isEdit ? props.initial.sortOrder : 0,
      triggerProductId,
      additions: additions.filter((a) => a.addedProductId.trim()),
    };

    const qtyResult = await updateProductOrderQtyLimits(triggerProductId, {
      qtyStep: Number(qtyStep) || 1,
      minOrderQty,
      maxOrderQty,
    });
    if (!qtyResult.ok) {
      setBusy(false);
      setMessage(qtyResult.error);
      return;
    }

    const result = isEdit
      ? await updateOrderLogicRule(props.initial.id, payload)
      : await createOrderLogicRule(payload);

    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    router.push(returnPath);
    router.refresh();
  }

  async function onDelete() {
    if (!isEdit || !window.confirm(`Delete rule “${name}”?`)) return;
    setBusy(true);
    const result = await deleteOrderLogicRule(props.initial.id);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    router.push(returnPath);
    router.refresh();
  }

  return (
    <form className="at-form" onSubmit={onSubmit}>
      <p className="at-form-hint">
        When the outlet orders the <strong>trigger product</strong>, the app adds the lines below. Set
        +/− and min / max for that trigger on this page.
      </p>

      <div className="at-form-section">
        <h3 className="at-form-sectionTitle">Rule</h3>
        <div className="at-form-grid">
          <label className="at-form-label">
            Rule name
            <input className="at-form-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="at-form-label">
            Trigger product
            <select
              className="at-form-select"
              value={triggerProductId}
              onChange={(e) => setTriggerProductId(e.target.value)}
              required
            >
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.name} ({p.uom}) — {p.productId.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="at-form-section">
        <h3 className="at-form-sectionTitle">Order quantity limits</h3>
        <p className="at-form-sectionLead">For the trigger product — +/− step and min / max on every order.</p>
        <div className="at-form-grid">
          <label className="at-form-label">
            +/- By
            <input
              className="at-form-input"
              type="number"
              min={0.001}
              step="any"
              value={qtyStep}
              onChange={(e) => setQtyStep(e.target.value)}
              required
            />
          </label>
          <label className="at-form-label">
            Minimum order qty
            <input
              className="at-form-input"
              type="number"
              min={0}
              step="any"
              placeholder="No minimum"
              value={minOrderQty}
              onChange={(e) => setMinOrderQty(e.target.value)}
            />
          </label>
          <label className="at-form-label">
            Maximum order qty
            <input
              className="at-form-input"
              type="number"
              min={0}
              step="any"
              placeholder="No maximum"
              value={maxOrderQty}
              onChange={(e) => setMaxOrderQty(e.target.value)}
            />
          </label>
          <div className="at-form-label">
            Rule active
            <div className="at-form-toggleCell">
              <button
                type="button"
                className={`at-ruleToggle ${active ? "at-ruleToggleOn" : "at-ruleToggleOff"}`}
                onClick={() => setActive((v) => !v)}
                aria-pressed={active}
                title={active ? "Rule is active" : "Rule is inactive"}
              >
                <span className="at-ruleToggleKnob" />
              </button>
              <span className="at-ruleToggleLabel">{active ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="at-form-section">
        <h3 className="at-form-sectionTitle">Automatically add to the order</h3>
        {additions.map((row, index) => (
          <div key={index} className="at-form-additionBlock">
            <label className="at-form-label">
              Product to add
              <select
                className="at-form-select"
                value={row.addedProductId}
                onChange={(e) => updateAddition(index, { addedProductId: e.target.value })}
                required
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.name} ({p.uom}) — {p.productId.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </label>
            <label className="at-form-label">
              Qty
              <input
                className="at-form-input"
                type="number"
                min={0.001}
                step="any"
                value={row.qtyPerTriggerUnit}
                onChange={(e) =>
                  updateAddition(index, { qtyPerTriggerUnit: Number(e.target.value) || 0 })
                }
                required
              />
            </label>
          </div>
        ))}
        <div className="at-form-actions">
          <button
            type="button"
            className="at-form-toolbarBtn"
            onClick={() => setAdditions((r) => [...r, emptyRow()])}
          >
            + Add another product line
          </button>
        </div>
      </div>

      {message ? (
        <p className="at-form-msgErr" role="alert">
          {message}
        </p>
      ) : null}

      <div className="at-form-actions">
        {isEdit ? (
          <button type="button" className="at-form-dangerBtn" disabled={busy} onClick={() => void onDelete()}>
            Delete rule
          </button>
        ) : null}
        <button type="button" className="at-form-cancelBtn" onClick={() => router.push(returnPath)}>
          Cancel
        </button>
        <button type="submit" className="at-form-submitBtn" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save rule" : "Create rule"}
        </button>
      </div>
    </form>
  );
}
