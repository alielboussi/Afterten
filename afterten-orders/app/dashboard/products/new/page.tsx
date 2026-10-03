import Link from "next/link";
import { CreateProductFlow } from "../CreateProductFlow";

export default function NewProductPage() {
  return (
    <div className="at-page-shell">
      <Link href="/dashboard/products" className="at-backLink">
        ← Back to Products
      </Link>
      <h1 className="at-page-title">Create product</h1>
      <p className="at-page-lead">Add a catalog line for all outlets to order from.</p>
      <CreateProductFlow />
    </div>
  );
}
