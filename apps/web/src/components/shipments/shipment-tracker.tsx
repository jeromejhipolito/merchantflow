import type { ShipmentStatus } from "@merchantflow/shared-types";
import { cn } from "@/lib/utils";
import { Clock, Tag, Truck, Navigation, CheckCircle2 } from "lucide-react";

interface TrackerStep {
  label: string;
  icon: React.ElementType;
  key: string;
}

const steps: TrackerStep[] = [
  { label: "Pending", icon: Clock, key: "PENDING" },
  { label: "Label Ready", icon: Tag, key: "LABEL_READY" },
  { label: "Shipped", icon: Truck, key: "SHIPPED" },
  { label: "In Transit", icon: Navigation, key: "IN_TRANSIT" },
  { label: "Delivered", icon: CheckCircle2, key: "DELIVERED" },
];

const statusOrder: Record<string, number> = {
  PENDING: 0,
  LABEL_GENERATING: 0,
  LABEL_READY: 1,
  LABEL_FAILED: -1,
  SHIPPED: 2,
  IN_TRANSIT: 3,
  DELIVERED: 4,
  FAILED: -1,
  RETURNED: -1,
};

export function ShipmentTracker({ status }: { status: ShipmentStatus }) {
  const currentIdx = statusOrder[status] ?? -1;

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, i) => {
        const completed = currentIdx >= i;
        const active = currentIdx === i;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                  completed
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 bg-white",
                  active && "ring-4 ring-brand-100"
                )}
              >
                <step.icon
                  className={cn(
                    "h-5 w-5",
                    completed ? "text-brand-600" : "text-gray-400"
                  )}
                />
              </div>
              <p
                className={cn(
                  "mt-2 text-xs font-medium",
                  completed ? "text-gray-900" : "text-gray-400"
                )}
              >
                {step.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-0.5 w-10 sm:w-14 md:w-20",
                  currentIdx > i ? "bg-brand-500" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
