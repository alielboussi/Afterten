import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyParentCatalogToProduct } from "./catalog-lines";
import { orderQtyCap } from "./order-qty-limits";

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
  outlets?: { name: string } | { name: string }[] | null;
};

export function getOutletDisplayName(profile: OutletProfile): string {
  const fromProfile = profile.outlet_name?.trim();
  if (fromProfile) return fromProfile;

  const outletJoin = profile.outlets;
  const outletRecord = Array.isArray(outletJoin) ? outletJoin[0] : outletJoin;
  const fromOutlet = outletRecord?.name?.trim();
  if (fromOutlet) return fromOutlet;

  const fromAlias = profile.alias?.trim();
  if (fromAlias) return fromAlias;

  const local = profile.email.split("@")[0]?.trim();
  return local || "Outlet";
}

export type OutletProductVariant = {
  variant_id: string;
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
  max_order_qty_days: number | null;
  window_ordered_qty: number | null;
  units_per_order_unit: number;
  units_per_order_uom: string;
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
  max_order_qty_days: number | null;
  window_ordered_qty: number | null;
  units_per_order_unit: number;
  units_per_order_uom: string;
  has_variants: boolean;
  variants: OutletProductVariant[];
};

export type OrderQtyLine = Pick<
  OutletProduct,
  | "qty_step"
  | "min_order_qty"
  | "max_order_qty"
  | "max_order_qty_days"
  | "window_ordered_qty"
  | "units_per_order_unit"
  | "units_per_order_uom"
  | "uom"
>;

export function clampOrderQty(line: OrderQtyLine, qty: number): number {
  let next = qty;
  const step = line.qty_step > 0 ? line.qty_step : 1;
  if (line.min_order_qty != null && next < line.min_order_qty) {
    next = line.min_order_qty;
  }
  const cap = orderQtyCap(line);
  if (cap != null && next > cap) {
    next = cap;
  }
  if (next <= 0) return 0;
  const steps = Math.round(next / step);
  return Math.max(steps * step, line.min_order_qty ?? step);
}

function mapVariant(raw: Record<string, unknown>): OutletProductVariant {
  return {
    variant_id: String(raw.variant_id),
    name: String(raw.name),
    uom: String(raw.uom),
    unit_cost: Number(raw.unit_cost),
    image_url: (raw.image_url as string | null) ?? null,
    live_qty_gate_enabled: Boolean(raw.live_qty_gate_enabled),
    live_qty: raw.live_qty != null ? Number(raw.live_qty) : null,
    orderable: Boolean(raw.orderable),
    qty_step: Number(raw.qty_step ?? 1),
    min_order_qty: raw.min_order_qty != null ? Number(raw.min_order_qty) : null,
    max_order_qty: raw.max_order_qty != null ? Number(raw.max_order_qty) : null,
    max_order_qty_days: raw.max_order_qty_days != null ? Number(raw.max_order_qty_days) : null,
    window_ordered_qty:
      raw.window_ordered_qty != null ? Number(raw.window_ordered_qty) : null,
    units_per_order_unit: Number(raw.units_per_order_unit ?? 1),
    units_per_order_uom: String(raw.units_per_order_uom ?? "pcs").trim() || "pcs",
  };
}

function mapOutletProduct(raw: Record<string, unknown>): OutletProduct {
  const variantsRaw = raw.variants;
  const variants = Array.isArray(variantsRaw)
    ? variantsRaw.map((v) => mapVariant(v as Record<string, unknown>))
    : [];

  return {
    product_id: String(raw.product_id),
    name: String(raw.name),
    uom: String(raw.uom),
    unit_cost: Number(raw.unit_cost),
    image_url: (raw.image_url as string | null) ?? null,
    live_qty_gate_enabled: Boolean(raw.live_qty_gate_enabled),
    live_qty: raw.live_qty != null ? Number(raw.live_qty) : null,
    orderable: Boolean(raw.orderable),
    qty_step: Number(raw.qty_step ?? 1),
    min_order_qty: raw.min_order_qty != null ? Number(raw.min_order_qty) : null,
    max_order_qty: raw.max_order_qty != null ? Number(raw.max_order_qty) : null,
    max_order_qty_days: raw.max_order_qty_days != null ? Number(raw.max_order_qty_days) : null,
    window_ordered_qty:
      raw.window_ordered_qty != null ? Number(raw.window_ordered_qty) : null,
    units_per_order_unit: Number(raw.units_per_order_unit ?? 1),
    units_per_order_uom: String(raw.units_per_order_uom ?? "pcs").trim() || "pcs",
    has_variants: Boolean(raw.has_variants),
    variants,
  };
}

let productsCache: { products: OutletProduct[]; fetchedAt: number } | null = null;
const PRODUCTS_CACHE_TTL_MS = 20 * 60 * 1000;

export function clearOutletProductsCache(): void {
  productsCache = null;
}

export async function fetchOutletProducts(
  supabase: ReturnType<typeof createSupabaseClient>,
  options?: { force?: boolean },
): Promise<{ products: OutletProduct[]; error: string | null }> {
  const now = Date.now();
  if (!options?.force && productsCache && now - productsCache.fetchedAt < PRODUCTS_CACHE_TTL_MS) {
    return { products: productsCache.products, error: null };
  }

  const { data, error } = await supabase.rpc("list_outlet_products");
  if (error) return { products: [], error: error.message };
  const products = (data ?? []).map((row: Record<string, unknown>) =>
    applyParentCatalogToProduct(mapOutletProduct(row)),
  );
  productsCache = { products, fetchedAt: now };
  return { products, error: null };
}

export async function fetchOutletProfile(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<{ profile: OutletProfile | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_outlet_app_profile");
  if (error) return { profile: null, error: error.message };

  const payload = data as Record<string, unknown> | null;
  const errCode = typeof payload?.error === "string" ? payload.error : null;
  if (errCode === "portal_admin") {
    await supabase.auth.signOut();
    return { profile: null, error: "Portal admin accounts cannot use the outlet app." };
  }
  if (errCode === "inactive") {
    return { profile: null, error: "This outlet account is disabled." };
  }
  if (errCode === "no_profile" || !payload?.profile || typeof payload.profile !== "object") {
    return { profile: null, error: "No outlet profile for this account." };
  }

  const row = payload.profile as Record<string, unknown>;
  const profile: OutletProfile = {
    user_id: String(row.user_id ?? ""),
    email: String(row.email ?? ""),
    alias: row.alias != null ? String(row.alias) : null,
    outlet_id: String(row.outlet_id ?? ""),
    outlet_name: String(row.outlet_name ?? ""),
    active: Boolean(row.active),
    profile_kind: String(row.profile_kind ?? "outlet_app"),
  };

  return { profile, error: null };
}
