import { cache } from "react";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { portalDisplayName } from "@/lib/portal/display-name";

/** One auth + admin check per request (layout + pages share this). */
export const getPortalAdminSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: isAdmin, error } = await supabase.rpc("is_portal_admin");
  if (error || !isAdmin) redirect("/unauthorized");

  return { supabase, user };
});

export async function requirePortalAdmin() {
  return getPortalAdminSession();
}

async function fetchWelcomeName(userId: string, email: string | undefined) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("portal_user_profiles")
      .select("alias")
      .eq("user_id", userId)
      .maybeSingle();
    return portalDisplayName(data?.alias ?? null, email);
  } catch {
    return portalDisplayName(null, email);
  }
}

export function getCachedWelcomeName(userId: string, email: string | undefined) {
  return unstable_cache(
    () => fetchWelcomeName(userId, email),
    ["portal-welcome-name", userId],
    { revalidate: 120, tags: [`welcome-${userId}`, "portal-admins-list"] },
  )();
}
