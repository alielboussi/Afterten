"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { logPortalAudit } from "@/lib/portal/portal-audit";

export type OutletEmployeeRow = {
  id: string;
  displayName: string;
  passcodePlain: string;
  active: boolean;
  sortOrder: number;
};

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function listOutletEmployees(outletId: string): Promise<
  { ok: true; employees: OutletEmployeeRow[] } | { ok: false; error: string }
> {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const id = outletId.trim().toUpperCase();
  if (!id) return { ok: false, error: "Invalid outlet." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("outlet_employees")
    .select("id, display_name, passcode_plain, active, sort_order")
    .eq("outlet_id", id)
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    employees: (data ?? []).map((row) => ({
      id: row.id as string,
      displayName: row.display_name as string,
      passcodePlain: row.passcode_plain as string,
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order ?? 0),
    })),
  };
}

export async function createOutletEmployee(input: {
  outletId: string;
  staffUserId: string;
  displayName: string;
  passcode: string;
}) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const outletId = input.outletId.trim().toUpperCase();
  const displayName = normalizeName(input.displayName);
  const passcode = input.passcode.trim();

  if (!outletId) return { ok: false as const, error: "Invalid outlet." };
  if (displayName.length < 2) {
    return { ok: false as const, error: "Employee name must be at least 2 characters." };
  }
  if (passcode.length < 4) {
    return { ok: false as const, error: "Passcode must be at least 4 characters." };
  }

  const admin = createAdminClient();
  const { data: hash, error: hashError } = await admin.rpc("hash_outlet_employee_passcode", {
    p_passcode: passcode,
  });
  if (hashError) return { ok: false as const, error: hashError.message };
  if (typeof hash !== "string" || !hash) {
    return { ok: false as const, error: "Could not hash passcode." };
  }

  const { error: insertError } = await admin.from("outlet_employees").insert({
    outlet_id: outletId,
    display_name: displayName,
    passcode_hash: hash,
    passcode_plain: passcode,
    active: true,
    updated_at: new Date().toISOString(),
  });
  if (insertError) return { ok: false as const, error: insertError.message };

  revalidatePath("/dashboard/outlet-users");
  revalidatePath(`/dashboard/outlet-users/${input.staffUserId}/employees`);
  await logPortalAudit({
    pagePath: "/dashboard/outlet-users",
    actionKind: "add",
    actionText: `Added outlet employee “${displayName}” for ${outletId}.`,
    metadata: { outletId, displayName },
  });
  return { ok: true as const };
}

export async function updateOutletEmployee(input: {
  employeeId: string;
  outletId: string;
  staffUserId: string;
  displayName: string;
  passcode: string | null;
  active: boolean;
}) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const outletId = input.outletId.trim().toUpperCase();
  const displayName = normalizeName(input.displayName);
  const passcode = input.passcode?.trim() ?? "";

  if (!outletId || !input.employeeId) {
    return { ok: false as const, error: "Invalid employee." };
  }
  if (displayName.length < 2) {
    return { ok: false as const, error: "Employee name must be at least 2 characters." };
  }

  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    display_name: displayName,
    active: input.active,
    updated_at: new Date().toISOString(),
  };

  if (passcode.length > 0) {
    if (passcode.length < 4) {
      return { ok: false as const, error: "Passcode must be at least 4 characters." };
    }
    const { data: hash, error: hashError } = await admin.rpc("hash_outlet_employee_passcode", {
      p_passcode: passcode,
    });
    if (hashError) return { ok: false as const, error: hashError.message };
    if (typeof hash !== "string" || !hash) {
      return { ok: false as const, error: "Could not hash passcode." };
    }
    patch.passcode_hash = hash;
    patch.passcode_plain = passcode;
  }

  const { error } = await admin
    .from("outlet_employees")
    .update(patch)
    .eq("id", input.employeeId)
    .eq("outlet_id", outletId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/outlet-users");
  revalidatePath(`/dashboard/outlet-users/${input.staffUserId}/employees`);
  await logPortalAudit({
    pagePath: "/dashboard/outlet-users",
    actionKind: "edit",
    actionText: `Updated outlet employee “${displayName}” for ${outletId}.`,
    metadata: { outletId, employeeId: input.employeeId },
  });
  return { ok: true as const };
}

export async function deleteOutletEmployee(input: {
  employeeId: string;
  outletId: string;
  staffUserId: string;
}) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const outletId = input.outletId.trim().toUpperCase();
  if (!outletId || !input.employeeId) {
    return { ok: false as const, error: "Invalid employee." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("outlet_employees")
    .delete()
    .eq("id", input.employeeId)
    .eq("outlet_id", outletId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/outlet-users");
  revalidatePath(`/dashboard/outlet-users/${input.staffUserId}/employees`);
  await logPortalAudit({
    pagePath: "/dashboard/outlet-users",
    actionKind: "delete",
    actionText: `Removed an outlet employee from ${outletId}.`,
    metadata: { outletId, employeeId: input.employeeId },
  });
  return { ok: true as const };
}
