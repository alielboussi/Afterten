import Link from "next/link";
import { getCachedProductsList } from "@/lib/portal/products-cache";
import { OrderLogicRuleForm } from "../OrderLogicRuleForm";
import { toActiveProductOptions } from "../product-options";

export default async function NewLogicRulePage() {
  let products: Awaited<ReturnType<typeof getCachedProductsList>> = [];
  try {
    products = await getCachedProductsList();
  } catch {
    products = [];
  }

  const options = toActiveProductOptions(products);

  return (
    <div className="at-page-shell-wide">
      <Link href="/dashboard/logic" className="at-backLink">
        ← Back to Logic
      </Link>
      <h1 className="at-page-title">Create order rule</h1>
      <p className="at-page-lead">Auto-add products when a trigger product appears on an order.</p>
      <section className="at-page-card">
        <OrderLogicRuleForm mode="create" returnPath="/dashboard/logic" products={options} />
      </section>
    </div>
  );
}
