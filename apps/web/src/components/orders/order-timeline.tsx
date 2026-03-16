import type { Order } from "@merchantflow/shared-types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import {
  ShoppingCart,
  CreditCard,
  Package,
  Truck,
  CheckCircle2,
} from "lucide-react";

interface TimelineStep {
  label: string;
  icon: React.ElementType;
  completed: boolean;
  date?: string;
}

function getTimelineSteps(order: Order): TimelineStep[] {
  const isFulfilled =
    order.fulfillmentStatus === "FULFILLED" ||
    order.fulfillmentStatus === "PARTIALLY_FULFILLED";
  const isPaid =
    order.financialStatus === "PAID" ||
    order.financialStatus === "PARTIALLY_REFUNDED";
  const hasShipped = order.shipments.some(
    (s) => s.status === "SHIPPED" || s.status === "IN_TRANSIT" || s.status === "DELIVERED"
  );
  const hasDelivered = order.shipments.some((s) => s.status === "DELIVERED");

  return [
    {
      label: "Order Created",
      icon: ShoppingCart,
      completed: true,
      date: order.createdAt,
    },
    {
      label: "Payment Received",
      icon: CreditCard,
      completed: isPaid,
      date: isPaid ? order.createdAt : undefined,
    },
    {
      label: "Fulfilled",
      icon: Package,
      completed: isFulfilled,
      date: isFulfilled ? order.updatedAt : undefined,
    },
    {
      label: "Shipped",
      icon: Truck,
      completed: hasShipped,
      date: hasShipped ? order.updatedAt : undefined,
    },
    {
      label: "Delivered",
      icon: CheckCircle2,
      completed: hasDelivered,
      date: hasDelivered ? order.updatedAt : undefined,
    },
  ];
}

export function OrderTimeline({ order }: { order: Order }) {
  const steps = getTimelineSteps(order);

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border-2",
                step.completed
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-200 bg-white"
              )}
            >
              <step.icon
                className={cn(
                  "h-5 w-5",
                  step.completed ? "text-emerald-600" : "text-gray-400"
                )}
              />
            </div>
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                step.completed ? "text-gray-900" : "text-gray-400"
              )}
            >
              {step.label}
            </p>
            {step.date && step.completed && (
              <p className="mt-0.5 text-[10px] text-gray-400">
                {formatDate(step.date)}
              </p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "mx-2 h-0.5 w-12 sm:w-16 md:w-20",
                steps[i + 1].completed ? "bg-emerald-500" : "bg-gray-200"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
