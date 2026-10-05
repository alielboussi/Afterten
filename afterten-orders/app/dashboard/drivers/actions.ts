"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";

export async function addDeliveryDriver(name: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { ok: false as const, error: "Driver name must be at least 2 characters." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("delivery_drivers").insert({
    name: trimmed,
    active: true,
  });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/drivers");
  return { ok: true as const };
}

export async function setDeliveryDriverActive(driverId: string, active: boolean) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;
  if (!driverId) return { ok: false as const, error: "Invalid driver." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("delivery_drivers")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", driverId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/drivers");
  return { ok: true as const };
}
