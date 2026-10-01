import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/dashboard");
  const isUnauthorizedPage = path === "/unauthorized";

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // Dashboard admin check runs once in layout (React cache) — skip duplicate RPC here.
  if (user && isProtected) {
    return supabaseResponse;
  }

  if (user && path === "/login") {
    const { data: isAdmin } = await supabase.rpc("is_portal_admin");
    const target = request.nextUrl.clone();
    target.pathname = isAdmin ? "/dashboard" : "/unauthorized";
    target.search = "";
    return NextResponse.redirect(target);
  }

  if (user && isUnauthorizedPage) {
    const { data: isAdmin } = await supabase.rpc("is_portal_admin");
    if (isAdmin) {
      const dash = request.nextUrl.clone();
      dash.pathname = "/dashboard";
      return NextResponse.redirect(dash);
    }
  }

  return supabaseResponse;
}
