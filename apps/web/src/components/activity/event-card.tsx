import type { ActivityEvent } from "@merchantflow/shared-types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ShoppingCart,
  Truck,
  Package,
  RefreshCw,
  Webhook,
  CheckCircle2,
  AlertTriangle,
  Boxes,
} from "lucide-react";

const eventIcons: Record<string, React.ElementType> = {
  "order.created": ShoppingCart,
  "order.updated": RefreshCw,
  "order.fulfilled": Package,
  "shipment.created": Boxes,
  "shipment.shipped": Truck,
  "shipment.delivered": CheckCircle2,
  "product.synced": RefreshCw,
  "webhook.received": Webhook,
  "webhook.delivered": CheckCircle2,
  "webhook.failed": AlertTriangle,
  "sync.completed": RefreshCw,
};

const eventColors: Record<string, string> = {
  "order.created": "bg-blue-100 text-blue-600",
  "order.updated": "bg-gray-100 text-gray-600",
  "order.fulfilled": "bg-emerald-100 text-emerald-600",
  "shipment.created": "bg-purple-100 text-purple-600",
  "shipment.shipped": "bg-brand-100 text-brand-600",
  "shipment.delivered": "bg-emerald-100 text-emerald-600",
  "product.synced": "bg-cyan-100 text-cyan-600",
  "webhook.received": "bg-gray-100 text-gray-600",
  "webhook.delivered": "bg-emerald-100 text-emerald-600",
  "webhook.failed": "bg-red-100 text-red-600",
  "sync.completed": "bg-teal-100 text-teal-600",
};

export function EventCard({ event }: { event: ActivityEvent }) {
  const Icon = eventIcons[event.type] ?? RefreshCw;
  const colorClass = eventColors[event.type] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          colorClass
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">{event.title}</p>
          <time className="shrink-0 text-xs text-gray-400">
            {formatRelativeTime(event.timestamp)}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">{event.description}</p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
          {event.type}
        </p>
      </div>
    </div>
  );
}
