import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requirePortalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin, error } = await supabase.rpc("is_portal_admin");
  if (error || !isAdmin) {
    redirect("/unauthorized");
  }

  return { supabase, user };
}
