import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedOrderLogicRule } from "@/lib/portal/order-logic-cache";
import { getCachedProductsList } from "@/lib/portal/products-cache";
import { OrderLogicRuleForm } from "../../OrderLogicRuleForm";
import { toActiveProductOptions } from "../../product-options";

type Props = { params: Promise<{ ruleId: string }> };

export default async function EditLogicRulePage({ params }: Props) {
  const { ruleId } = await params;
  let rule: Awaited<ReturnType<typeof getCachedOrderLogicRule>> = null;
  let products: Awaited<ReturnType<typeof getCachedProductsList>> = [];
  let loadError: string | null = null;

  try {
    [rule, products] = await Promise.all([getCachedOrderLogicRule(ruleId), getCachedProductsList()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load rule.";
  }

  if (!loadError && !rule) notFound();

  const options = toActiveProductOptions(products);

  return (
    <div className="at-page-shell-wide">
      <Link href="/dashboard/logic" className="at-backLink">
        ← Back to Logic
      </Link>
      <h1 className="at-page-title">Edit order rule</h1>

      {loadError ? (
        <p className="at-page-msgErr">{loadError}</p>
      ) : rule ? (
        <section className="at-page-card">
          <OrderLogicRuleForm
            mode="edit"
            returnPath="/dashboard/logic"
            products={options}
            initial={{
              id: rule.id,
              name: rule.name,
              description: rule.description ?? "",
              active: rule.active,
              sortOrder: rule.sortOrder,
              triggerProductId: rule.triggerProductId,
              additions: rule.additions.map((a) => ({
                addedProductId: a.addedProductId,
                qtyPerTriggerUnit: a.qtyPerTriggerUnit,
              })),
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
