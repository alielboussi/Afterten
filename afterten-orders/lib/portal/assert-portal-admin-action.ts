import { createClient } from "@/lib/supabase/server";

export async function assertCallerIsPortalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Not signed in." };
  }
  const { data: isAdmin, error } = await supabase.rpc("is_portal_admin");
  if (error || !isAdmin) {
    return { ok: false as const, error: "Only portal admins can do this." };
  }
  return { ok: true as const, userId: user.id };
}
