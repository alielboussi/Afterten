import { createAdminClient } from "@/lib/supabase/admin-server";
import { ReturnsTable, type PortalReturnRow } from "./ReturnsTable";

export const dynamic = "force-dynamic";

function formatCreated(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

async function signedUrl(
  admin: ReturnType<typeof createAdminClient>,
  dbPath: string | null | undefined,
): Promise<string | null> {
  if (!dbPath?.trim()) return null;
  const trimmed = dbPath.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return null;
  const bucket = trimmed.slice(0, slash);
  const key = trimmed.slice(slash + 1);
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default async function ReturnsPage() {
  let returns: PortalReturnRow[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("outlet_returns")
      .select(
        "id, return_number, outlet_id, outlet_name, status, employee_name, created_at, photo_path, pdf_path",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    returns = await Promise.all(
      (data ?? []).map(async (row) => {
        const pdfPath = row.pdf_path as string | null;
        const photoPath = row.photo_path as string | null;
        const pdfFileName = pdfPath ? pdfPath.split("/").pop() ?? null : null;
        const [photo_url, pdf_url] = await Promise.all([
          signedUrl(admin, photoPath),
          signedUrl(admin, pdfPath),
        ]);
        return {
          id: String(row.id),
          return_number: String(row.return_number),
          outlet_id: String(row.outlet_id),
          outlet_name: String(row.outlet_name),
          status: String(row.status),
          employee_name: String(row.employee_name),
          placed_at_label: formatCreated(String(row.created_at)),
          photo_url,
          pdf_url,
          pdf_file_name: pdfFileName,
        };
      }),
    );
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load returns.";
  }

  return (
    <div className="at-page-shell-table">
      <h1 className="at-page-title">Returns</h1>
      <p className="at-page-lead">
        Product returns from outlet apps — photo, employee, and return PDF (1 hour signed links).
      </p>
      {loadError ? (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("outlet_returns")
            ? " Run migration 20261006190000_outlet_returns.sql on Supabase."
            : null}
        </p>
      ) : (
        <ReturnsTable returns={returns} />
      )}
    </div>
  );
}
