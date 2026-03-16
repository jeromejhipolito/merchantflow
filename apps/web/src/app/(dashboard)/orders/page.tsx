import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrderTable } from "@/components/orders/order-table";
import { SkeletonTable } from "@/components/ui/skeleton";

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Manage and track all your e-commerce orders"
      />

      <Suspense fallback={null}>
        <OrderFilters />
      </Suspense>

      <Suspense fallback={<SkeletonTable rows={10} cols={6} />}>
        <OrderTable />
      </Suspense>
    </div>
  );
}
