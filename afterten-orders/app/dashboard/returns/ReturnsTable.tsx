export type PortalReturnRow = {
  id: string;
  return_number: string;
  outlet_id: string;
  outlet_name: string;
  status: string;
  employee_name: string;
  placed_at_label: string;
  photo_url: string | null;
  pdf_url: string | null;
  pdf_file_name: string | null;
};

function statusLabel(status: string): string {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Submitted";
}

export function ReturnsTable({ returns }: { returns: PortalReturnRow[] }) {
  if (returns.length === 0) {
    return <p className="at-page-muted">No returns yet.</p>;
  }

  return (
    <div className="at-tableWrap">
      <table className="at-table">
        <thead>
          <tr>
            <th>Return #</th>
            <th>Outlet</th>
            <th>Employee</th>
            <th>Photo</th>
            <th>PDF</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {returns.map((r) => (
            <tr key={r.id}>
              <td>{r.return_number}</td>
              <td>
                {r.outlet_name} ({r.outlet_id})
              </td>
              <td>{r.employee_name}</td>
              <td>
                {r.photo_url ? (
                  <a href={r.photo_url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.photo_url}
                      alt={`Return ${r.return_number}`}
                      style={{ maxWidth: 120, maxHeight: 80, borderRadius: 8 }}
                    />
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {r.pdf_url ? (
                  <a href={r.pdf_url} target="_blank" rel="noreferrer" className="at-createBtn">
                    Download PDF
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>{statusLabel(r.status)}</td>
              <td>{r.placed_at_label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
