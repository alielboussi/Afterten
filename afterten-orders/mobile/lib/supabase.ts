import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseConfigured() {
  return Boolean(url && anonKey && !url.includes("YOUR_PROJECT"));
}

export function createSupabaseClient() {
  if (!supabaseConfigured()) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env",
    );
  }
  return createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export type OutletProfile = {
  user_id: string;
  email: string;
  alias: string | null;
  outlet_id: string;
  outlet_name: string;
  active: boolean;
  profile_kind: string;
};

export type OutletProduct = {
  product_id: string;
  name: string;
  uom: string;
  unit_cost: number;
  image_url: string | null;
  live_qty_gate_enabled: boolean;
  live_qty: number | null;
  orderable: boolean;
  qty_step: number;
  min_order_qty: number | null;
  max_order_qty: number | null;
};

export function clampOrderQty(
  product: OutletProduct,
  qty: number,
): number {
  let next = qty;
  const step = product.qty_step > 0 ? product.qty_step : 1;
  if (product.min_order_qty != null && next < product.min_order_qty) {
    next = product.min_order_qty;
  }
  if (product.max_order_qty != null && next > product.max_order_qty) {
    next = product.max_order_qty;
  }
  if (next <= 0) return 0;
  const steps = Math.round(next / step);
  return Math.max(steps * step, product.min_order_qty ?? step);
}

export async function fetchOutletProducts(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<{ products: OutletProduct[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_outlet_products");
  if (error) return { products: [], error: error.message };
  return { products: (data ?? []) as OutletProduct[], error: null };
}

export async function fetchOutletProfile(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<{ profile: OutletProfile | null; error: string | null }> {
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_portal_admin");
  if (adminErr) return { profile: null, error: adminErr.message };
  if (isAdmin) {
    await supabase.auth.signOut();
    return { profile: null, error: "Portal admin accounts cannot use the outlet app." };
  }

  const { data, error } = await supabase
    .from("app_profiles")
    .select("user_id, email, alias, outlet_id, outlet_name, active, profile_kind")
    .eq("profile_kind", "outlet_app")
    .maybeSingle();

  if (error) return { profile: null, error: error.message };
  if (!data) return { profile: null, error: "No outlet profile for this account." };
  if (!data.active) return { profile: null, error: "This outlet account is disabled." };

  return { profile: data as OutletProfile, error: null };
}
