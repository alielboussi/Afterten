import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PORTAL_URL = "https://aftertentransfers.app";

function portalBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_PORTAL_URL?.trim() || DEFAULT_PORTAL_URL;
  return raw.replace(/\/$/, "");
}

async function ensureReturnPdf(
  supabase: SupabaseClient,
  returnId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const res = await fetch(`${portalBaseUrl()}/api/outlet-app/ensure-return-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ return_id: returnId }),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg =
      (typeof body?.error === "string" && body.error) ||
      `Could not build return PDF (HTTP ${res.status}).`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

export async function submitOutletReturn(
  supabase: SupabaseClient,
  input: {
    returnId: string;
    outletEmployeeId: string;
    employeePasscode: string;
    photoDbPath: string;
    signatureDbPath: string;
  },
): Promise<
  { ok: true; returnNumber: string; returnId: string } | { ok: false; error: string }
> {
  const passcode = input.employeePasscode.trim();
  if (!input.outletEmployeeId.trim()) {
    return { ok: false, error: "Select an employee." };
  }
  if (passcode.length < 4) {
    return { ok: false, error: "Enter the employee passcode." };
  }

  const { data, error } = await supabase.rpc("submit_outlet_return", {
    p_return_id: input.returnId,
    p_outlet_employee_id: input.outletEmployeeId.trim(),
    p_employee_passcode: passcode,
    p_employee_signature_path: input.signatureDbPath,
    p_photo_path: input.photoDbPath,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  const returnNumber =
    typeof row?.return_number === "string" && row.return_number.trim()
      ? row.return_number.trim()
      : "—";
  const returnId =
    typeof row?.return_id === "string" && row.return_id.trim() ? row.return_id.trim() : input.returnId;

  const pdf = await ensureReturnPdf(supabase, returnId);
  if (!pdf.ok) {
    return { ok: false, error: pdf.error };
  }

  return { ok: true, returnNumber, returnId };
}
