"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPortalAuditLog, type PortalAuditRow } from "../audit/actions";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function PortalHistoryClient() {
  const [rows, setRows] = useState<PortalAuditRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    const result = await fetchPortalAuditLog(nextOffset);
    if (append) setLoadingMore(false);
    else setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows((prev) => (append ? [...prev, ...result.rows] : result.rows));
    setOffset(nextOffset + result.rows.length);
    setHasMore(result.hasMore);
  }, []);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <div>
      {error ? <p className="at-page-msgErr">{error}</p> : null}
      {loading ? <p>Loading history…</p> : null}
      {!loading && rows.length === 0 ? <p>No actions recorded yet.</p> : null}
      {!loading && rows.length > 0 ? (
        <div className="at-tableWrap">
          <table className="at-table at-historyTable">
            <thead>
              <tr>
                <th>When (Kitwe)</th>
                <th>User</th>
                <th>Page</th>
                <th>Kind</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.created_at)}</td>
                  <td>{row.actor_email}</td>
                  <td>{row.page_path}</td>
                  <td>{row.action_kind}</td>
                  <td style={{ textAlign: "left" }}>{row.action_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {hasMore ? (
        <p style={{ marginTop: 16, textAlign: "center" }}>
          <button
            type="button"
            className="at-btnSecondary"
            disabled={loadingMore}
            onClick={() => void load(offset, true)}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
