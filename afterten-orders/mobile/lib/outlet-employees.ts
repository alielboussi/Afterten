import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRpcJsonRows } from "./rpc-json";

export type OutletEmployeeOption = {
  id: string;
  displayName: string;
};

let employeesCache: { employees: OutletEmployeeOption[]; fetchedAt: number } | null = null;
const EMPLOYEES_CACHE_TTL_MS = 15 * 60 * 1000;

export function clearOutletEmployeesCache(): void {
  employeesCache = null;
}

export async function fetchOutletEmployeesForApp(
  supabase: SupabaseClient,
  options?: { force?: boolean },
): Promise<{ ok: true; employees: OutletEmployeeOption[] } | { ok: false; error: string }> {
  const now = Date.now();
  if (
    !options?.force &&
    employeesCache &&
    now - employeesCache.fetchedAt < EMPLOYEES_CACHE_TTL_MS
  ) {
    return { ok: true, employees: employeesCache.employees };
  }

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

  employeesCache = { employees, fetchedAt: now };
  return { ok: true, employees };
}
