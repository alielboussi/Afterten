import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRpcJsonRows } from "./rpc-json";

export type OutletEmployeeOption = {
  id: string;
  displayName: string;
};

export async function fetchOutletEmployeesForApp(
  supabase: SupabaseClient,
): Promise<{ ok: true; employees: OutletEmployeeOption[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("list_outlet_employees_for_app");
  if (error) {
    return { ok: false, error: error.message };
  }

  const employees = parseRpcJsonRows(data)
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const displayName =
        typeof row.display_name === "string" ? row.display_name.trim() : "";
      if (!id || !displayName) return null;
      return { id, displayName };
    })
    .filter((row): row is OutletEmployeeOption => row != null);

  return { ok: true, employees };
}
