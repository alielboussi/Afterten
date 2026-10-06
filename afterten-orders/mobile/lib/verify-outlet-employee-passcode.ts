import type { SupabaseClient } from "@supabase/supabase-js";

export async function verifyOutletEmployeePasscode(
  supabase: SupabaseClient,
  outletEmployeeId: string,
  passcode: string,
): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
  const id = outletEmployeeId.trim();
  const code = passcode.trim();
  if (!id) return { ok: false, error: "Select an employee." };
  if (code.length < 4) return { ok: false, error: "Enter the employee passcode." };

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

  return { ok: true, displayName };
}
