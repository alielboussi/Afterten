import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRpcJsonRows } from "./rpc-json";

export type OutletReturnRow = {
  id: string;
  returnNumber: string;
  status: "submitted" | "accepted" | "rejected";
  employeeName: string;
  createdAt: string;
  photoPath: string;
};

export async function fetchOutletReturns(
  supabase: SupabaseClient,
): Promise<{ ok: true; returns: OutletReturnRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("list_outlet_returns_for_app");
  if (error) return { ok: false, error: error.message };

  const returns = parseRpcJsonRows(data)
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const returnNumber = typeof row.return_number === "string" ? row.return_number : "";
      const status = row.status as OutletReturnRow["status"];
      const employeeName = typeof row.employee_name === "string" ? row.employee_name : "";
      const createdAt = typeof row.created_at === "string" ? row.created_at : "";
      const photoPath = typeof row.photo_path === "string" ? row.photo_path : "";
      if (!id || !returnNumber) return null;
      return {
        id,
        returnNumber,
        status: status === "accepted" || status === "rejected" ? status : "submitted",
        employeeName,
        createdAt,
        photoPath,
      };
    })
    .filter((r): r is OutletReturnRow => r != null);

  return { ok: true, returns };
}

export async function previewReturnNumber(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("preview_outlet_return_number");
  if (error || typeof data !== "string") return null;
  return data.trim() || null;
}
