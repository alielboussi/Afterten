export type ProductRow = {
  id: string;
  productId: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string | null;
  active: boolean;
  liveQtyGateEnabled: boolean;
  sortOrder: number;
  qtyStep: number;
  minOrderQty: number | null;
  maxOrderQty: number | null;
  hasVariants: boolean;
};
