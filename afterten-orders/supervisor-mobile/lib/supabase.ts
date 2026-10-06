import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseConfigured() {
  return Boolean(url && anonKey && !url.includes("YOUR_PROJECT"));
}

export function createSupabaseClient() {
  if (!supabaseConfigured()) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in supervisor-mobile/.env",
    );
  }
  return createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export type SupervisorProfile = {
  user_id: string;
  email: string;
  alias: string | null;
  approved: boolean;
};

export function supervisorDisplayName(profile: SupervisorProfile): string {
  const alias = profile.alias?.trim();
  if (alias) return alias;
  const local = profile.email.split("@")[0]?.trim();
  return local || "Supervisor";
}

export async function registerAndFetchSupervisorProfile(
  supabase: SupabaseClient,
): Promise<{ profile: SupervisorProfile | null; error: string | null }> {
  const { error: regErr } = await supabase.rpc("register_supervisor_app_user");
  if (regErr) return { profile: null, error: regErr.message };

  const { data, error } = await supabase.rpc("get_supervisor_app_profile");
  if (error) return { profile: null, error: error.message };
  if (!data || typeof data !== "object") {
    return { profile: null, error: "Could not load supervisor profile." };
  }

  const row = data as Record<string, unknown>;
  return {
    profile: {
      user_id: String(row.user_id ?? ""),
      email: String(row.email ?? ""),
      alias: row.alias != null ? String(row.alias) : null,
      approved: Boolean(row.approved),
    },
    error: null,
  };
}

export type SupervisorOrderRow = {
  order_id: string;
  outlet_id: string;
  outlet_name: string;
  order_number: string;
  status: string;
  employee_name: string | null;
  grand_total: number;
  created_at: string;
  loading_checklist_completed_at: string | null;
  loaded_at: string | null;
};

export type OutletFilterOption = {
  outlet_id: string;
  outlet_name: string;
};

export async function fetchOutletFilters(
  supabase: SupabaseClient,
): Promise<{ outlets: OutletFilterOption[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_outlets_for_supervisor");
  if (error) return { outlets: [], error: error.message };
  const outlets = (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      outlet_id: String(r.outlet_id ?? ""),
      outlet_name: String(r.outlet_name ?? ""),
    };
  });
  return { outlets, error: null };
}

export async function fetchSupervisorOrders(
  supabase: SupabaseClient,
  outletId: string | null,
  query: string,
  status: string | null = null,
): Promise<{ orders: SupervisorOrderRow[]; error: string | null }> {
  const statusParam =
    status && ["placed", "accepted", "loaded", "completed"].includes(status) ? status : null;
  const { data, error } = await supabase.rpc("list_supervisor_orders", {
    p_outlet_id: outletId,
    p_query: query.trim() || null,
    p_status: statusParam,
  });
  if (error) return { orders: [], error: error.message };

  const orders = (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      order_id: String(r.order_id ?? ""),
      outlet_id: String(r.outlet_id ?? ""),
      outlet_name: String(r.outlet_name ?? ""),
      order_number: String(r.order_number ?? ""),
      status: String(r.status ?? "placed"),
      employee_name: r.employee_name != null ? String(r.employee_name) : null,
      grand_total: Number(r.grand_total ?? 0),
      created_at: String(r.created_at ?? ""),
      loading_checklist_completed_at:
        r.loading_checklist_completed_at != null
          ? String(r.loading_checklist_completed_at)
          : null,
      loaded_at: r.loaded_at != null ? String(r.loaded_at) : null,
    };
  });

  return { orders, error: null };
}
