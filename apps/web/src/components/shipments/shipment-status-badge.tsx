import type { ShipmentStatus } from "@merchantflow/shared-types";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  ShipmentStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" | "info" | "purple" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  LABEL_GENERATING: { label: "Generating Label", variant: "info" },
  LABEL_READY: { label: "Label Ready", variant: "info" },
  LABEL_FAILED: { label: "Label Failed", variant: "danger" },
  SHIPPED: { label: "Shipped", variant: "purple" },
  IN_TRANSIT: { label: "In Transit", variant: "info" },
  DELIVERED: { label: "Delivered", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
  RETURNED: { label: "Returned", variant: "default" },
};

export function ShipmentStatusBadge({
  status,
}: {
  status: ShipmentStatus;
}) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
