"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { logPortalAudit } from "@/lib/portal/portal-audit";

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
  await logPortalAudit({
    pagePath: "/dashboard/drivers",
    actionKind: "add",
    actionText: `Added delivery driver "${trimmed}".`,
  });
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
  await logPortalAudit({
    pagePath: "/dashboard/drivers",
    actionKind: "edit",
    actionText: `${active ? "Activated" : "Deactivated"} delivery driver ${driverId}.`,
  });
  return { ok: true as const };
}

export async function deleteDeliveryDriver(driverId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;
  if (!driverId) return { ok: false as const, error: "Invalid driver." };

  const admin = createAdminClient();

  const { data: driver, error: driverErr } = await admin
    .from("delivery_drivers")
    .select("id, name")
    .eq("id", driverId)
    .maybeSingle();
  if (driverErr) return { ok: false as const, error: driverErr.message };
  if (!driver) return { ok: false as const, error: "Driver not found." };

  const driverName = String(driver.name).trim();
  const { error: snapErr } = await admin
    .from("outlet_orders")
    .update({
      driver_name: driverName,
      driver_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("driver_id", driverId);
  if (snapErr) return { ok: false as const, error: snapErr.message };

  const { error } = await admin.from("delivery_drivers").delete().eq("id", driverId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/drivers");
  await logPortalAudit({
    pagePath: "/dashboard/drivers",
    actionKind: "delete",
    actionText: `Deleted delivery driver "${String(driver.name)}".`,
    metadata: { driverId },
  });
  return { ok: true as const };
}
