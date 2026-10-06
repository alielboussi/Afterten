import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRpcJsonRows } from "./rpc-json";

export type SupervisorReturnRow = {
  id: string;
  returnNumber: string;
  outletId: string;
  outletName: string;
  status: "submitted" | "accepted" | "rejected";
  employeeName: string;
  createdAt: string;
  photoPath: string;
};

export type SupervisorReturnDetail = {
  id: string;
  returnNumber: string;
  outletId: string;
  outletName: string;
  status: "submitted" | "accepted" | "rejected";
  employeeName: string;
  photoPath: string;
  employeeSignaturePath: string;
  pdfPath: string | null;
  createdAt: string;
};

export async function fetchSupervisorReturns(
  supabase: SupabaseClient,
  query: string,
): Promise<{ ok: true; returns: SupervisorReturnRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("list_supervisor_returns", {
    p_query: query.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  const returns = parseRpcJsonRows(data)
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const returnNumber = typeof row.return_number === "string" ? row.return_number : "";
      const outletId = typeof row.outlet_id === "string" ? row.outlet_id : "";
      const outletName = typeof row.outlet_name === "string" ? row.outlet_name : "";
      const status = row.status as SupervisorReturnRow["status"];
      const employeeName = typeof row.employee_name === "string" ? row.employee_name : "";
      const createdAt = typeof row.created_at === "string" ? row.created_at : "";
      const photoPath = typeof row.photo_path === "string" ? row.photo_path : "";
      if (!id) return null;
      return {
        id,
        returnNumber,
        outletId,
        outletName,
        status: status === "accepted" || status === "rejected" ? status : "submitted",
        employeeName,
        createdAt,
        photoPath,
      };
    })
    .filter((r): r is SupervisorReturnRow => r != null);

  return { ok: true, returns };
}

export async function fetchSupervisorReturnDetail(
  supabase: SupabaseClient,
  returnId: string,
): Promise<{ ok: true; detail: SupervisorReturnDetail } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("get_outlet_return_detail", {
    p_return_id: returnId,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Return not found." };
  }
  const row = data as Record<string, unknown>;
  const status = row.status as SupervisorReturnDetail["status"];
  return {
    ok: true,
    detail: {
      id: String(row.id ?? ""),
      returnNumber: String(row.return_number ?? ""),
      outletId: String(row.outlet_id ?? ""),
      outletName: String(row.outlet_name ?? ""),
      status: status === "accepted" || status === "rejected" ? status : "submitted",
      employeeName: String(row.employee_name ?? ""),
      photoPath: String(row.photo_path ?? ""),
      employeeSignaturePath: String(row.employee_signature_path ?? ""),
      pdfPath: typeof row.pdf_path === "string" ? row.pdf_path : null,
      createdAt: String(row.created_at ?? ""),
    },
  };
}

export async function acceptSupervisorReturn(
  supabase: SupabaseClient,
  returnId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("accept_supervisor_return", { p_return_id: returnId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function rejectSupervisorReturn(
  supabase: SupabaseClient,
  returnId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("reject_supervisor_return", { p_return_id: returnId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadReturnStorageImageUrl(
  supabase: SupabaseClient,
  dbPath: string,
): Promise<string | null> {
  if (!dbPath.startsWith("returns/")) return null;
  const storageKey = dbPath.replace(/^returns\//, "");
  const { data, error } = await supabase.storage.from("returns").createSignedUrl(storageKey, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
