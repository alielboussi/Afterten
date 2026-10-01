import type { ProductRow } from "@/lib/portal/products-cache";
import type { ProductOption } from "./OrderLogicRuleForm";

export function toActiveProductOptions(products: ProductRow[]): ProductOption[] {
  return products
    .filter((p) => p.active)
    .map((p) => ({
      productId: p.productId,
      name: p.name,
      uom: p.uom,
      qtyStep: p.qtyStep,
      minOrderQty: p.minOrderQty,
      maxOrderQty: p.maxOrderQty,
    }));
}
