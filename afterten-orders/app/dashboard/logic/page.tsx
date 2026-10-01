import Link from "next/link";
import { getCachedOrderLogicRules } from "@/lib/portal/order-logic-cache";

export default async function LogicPage() {
  let rules: Awaited<ReturnType<typeof getCachedOrderLogicRules>> = [];
  let loadError: string | null = null;

  try {
    rules = await getCachedOrderLogicRules();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load rules.";
  }

  return (
    <div className="at-page-shell-wide">
      <h1 className="at-page-title">Logic</h1>
      <p className="at-page-lead">
        Auto-add rules when a trigger product is ordered. Set +/− and min / max qty on each rule’s setup
        page.
      </p>

      {loadError && (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("product_order_rules")
            ? " Run migration 20261001200000_product_uuids_order_logic.sql."
            : null}
        </p>
      )}

      {!loadError && (
        <section className="at-page-card">
          <div className="at-listHeader">
            <h2 className="at-page-sectionTitle">Order rules</h2>
            <Link href="/dashboard/logic/new" className="at-createBtn">
              Create rule
            </Link>
          </div>

          {rules.length === 0 ? (
            <p className="at-muted">No rules yet. Example: 1 shawarma tray → 4 bread bags.</p>
          ) : (
            <div className="at-tableWrap">
              <table className="at-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>When ordered</th>
                    <th>Adds</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td className="at-nameCell">
                        {r.name}
                        {r.description ? (
                          <>
                            <br />
                            <span
                              style={{
                                fontWeight: 400,
                                color: "var(--afterten-muted)",
                                fontSize: "0.82rem",
                              }}
                            >
                              {r.description}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td>{r.triggerProductName}</td>
                      <td>
                        {r.additions.length === 0
                          ? "—"
                          : r.additions
                              .map(
                                (a) => `${a.qtyPerTriggerUnit}× ${a.addedProductName} / trigger unit`,
                              )
                              .join("; ")}
                      </td>
                      <td>
                        <span className={r.active ? "at-badgeActive" : "at-badgeOff"}>
                          {r.active ? "Active" : "Off"}
                        </span>
                      </td>
                      <td>
                        <Link href={`/dashboard/logic/${r.id}/edit`} className="at-editBtn">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
