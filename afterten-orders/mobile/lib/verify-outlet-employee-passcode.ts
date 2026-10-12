import type { SupabaseClient } from "@supabase/supabase-js";

type VerifiedEntry = {
  displayName: string;
  verifiedAt: number;
};

const verifiedByKey = new Map<string, VerifiedEntry>();
const VERIFY_CACHE_TTL_MS = 20 * 60 * 1000;

function cacheKey(outletEmployeeId: string, passcode: string): string {
  return `${outletEmployeeId}:${passcode}`;
}

export function clearOutletEmployeePasscodeCache(): void {
  verifiedByKey.clear();
}

export async function verifyOutletEmployeePasscode(
  supabase: SupabaseClient,
  outletEmployeeId: string,
  passcode: string,
): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
  const id = outletEmployeeId.trim();
  const code = passcode.trim();
  if (!id) return { ok: false, error: "Select an employee." };
  if (code.length < 4) return { ok: false, error: "Enter the employee passcode." };

  const key = cacheKey(id, code);
  const cached = verifiedByKey.get(key);
  if (cached && Date.now() - cached.verifiedAt < VERIFY_CACHE_TTL_MS) {
    return { ok: true, displayName: cached.displayName };
  }

  const { data, error } = await supabase.rpc("verify_outlet_employee_passcode", {
    p_outlet_employee_id: id,
    p_employee_passcode: code,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  const displayName =
    typeof row?.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : "";

  verifiedByKey.set(key, { displayName, verifiedAt: Date.now() });
  return { ok: true, displayName };
}
