import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ code?: string; next?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  if (params.code) {
    const qs = new URLSearchParams({ code: params.code });
    if (params.next) qs.set("next", params.next);
    redirect(`/auth/callback?${qs.toString()}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_portal_admin");
  redirect(isAdmin ? "/dashboard" : "/unauthorized");
}
