import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UnauthorizedPanel } from "./UnauthorizedPanel";

export default async function UnauthorizedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_portal_admin");
  if (isAdmin) redirect("/dashboard");

  return <UnauthorizedPanel email={user.email ?? null} />;
}
