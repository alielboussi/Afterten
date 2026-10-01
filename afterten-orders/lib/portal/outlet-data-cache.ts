import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type OutletStaffRow = {
  userId: string;
  email: string;
  alias: string | null;
  outletId: string;
  outletName: string;
  active: boolean;
  outletAppPassword: string | null;
};

export type OutletOption = { id: string; name: string };

async function fetchOutletStaffList(): Promise<OutletStaffRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_profiles")
    .select("user_id, email, alias, outlet_id, outlet_name, active, outlet_app_password")
    .eq("profile_kind", "outlet_app")
    .order("outlet_id")
    .order("email");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    email: row.email as string,
    alias: (row.alias as string | null) ?? null,
    outletId: row.outlet_id as string,
    outletName: row.outlet_name as string,
    active: row.active as boolean,
    outletAppPassword: (row.outlet_app_password as string | null) ?? null,
  }));
}

async function fetchActiveOutlets(): Promise<OutletOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("outlets")
    .select("id, name")
    .eq("active", true)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as OutletOption[];
}

export function getCachedOutletStaffList() {
  return unstable_cache(fetchOutletStaffList, ["outlet-staff-list-v3"], {
    revalidate: 60,
    tags: ["outlet-users-list"],
  })();
}

export function getCachedActiveOutlets() {
  return unstable_cache(fetchActiveOutlets, ["active-outlets-v1"], {
    revalidate: 120,
    tags: ["outlets-list", "outlet-users-list"],
  })();
}

export function getCachedOutletStaffUser(userId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("app_profiles")
        .select("user_id, email, alias, outlet_id, outlet_name, active")
        .eq("user_id", userId)
        .eq("profile_kind", "outlet_app")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        userId: data.user_id as string,
        email: data.email as string,
        alias: (data.alias as string | null) ?? "",
        outletId: data.outlet_id as string,
        outletName: data.outlet_name as string,
        active: data.active as boolean,
      };
    },
    ["outlet-staff-user", userId],
    { revalidate: 30, tags: ["outlet-users-list", `outlet-user-${userId}`] },
  )();
}

export const OUTLET_USERS_LIST_TAG = "outlet-users-list";
export const OUTLETS_LIST_TAG = "outlets-list";
