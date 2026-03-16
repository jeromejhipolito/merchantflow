import type { OrderFulfillmentStatus } from "@merchantflow/shared-types";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  OrderFulfillmentStatus,
  { label: string; variant: "warning" | "info" | "success" | "purple" }
> = {
  UNFULFILLED: { label: "Unfulfilled", variant: "warning" },
  PARTIALLY_FULFILLED: { label: "Partial", variant: "info" },
  FULFILLED: { label: "Fulfilled", variant: "success" },
  RESTOCKED: { label: "Restocked", variant: "purple" },
};

export function OrderStatusBadge({
  status,
}: {
  status: OrderFulfillmentStatus;
}) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
