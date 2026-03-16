import type { OrderFinancialStatus } from "@merchantflow/shared-types";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  OrderFinancialStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" | "info" | "purple" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  AUTHORIZED: { label: "Authorized", variant: "info" },
  PARTIALLY_PAID: { label: "Partially Paid", variant: "info" },
  PAID: { label: "Paid", variant: "success" },
  PARTIALLY_REFUNDED: { label: "Partial Refund", variant: "purple" },
  REFUNDED: { label: "Refunded", variant: "danger" },
  VOIDED: { label: "Voided", variant: "default" },
};

export function FinancialStatusBadge({
  status,
}: {
  status: OrderFinancialStatus;
}) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
