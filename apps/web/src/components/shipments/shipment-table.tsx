"use client";

import { useRouter } from "next/navigation";
import type { Shipment } from "@merchantflow/shared-types";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ShipmentStatusBadge } from "./shipment-status-badge";
import { formatDate } from "@/lib/utils";
import { mockShipments, mockOrders } from "@/lib/mock-data";
import { ExternalLink } from "lucide-react";

function getOrderNumber(orderId: string): string {
  const order = mockOrders.find((o) => o.id === orderId);
  return order?.orderNumber ?? orderId;
}

const columns: Column<Shipment>[] = [
  {
    key: "id",
    header: "Shipment ID",
    render: (s) => (
      <span className="font-mono text-xs font-medium text-gray-900">
        {s.id}
      </span>
    ),
  },
  {
    key: "order",
    header: "Order",
    render: (s) => (
      <span className="font-medium text-brand-600">
        {getOrderNumber(s.orderId)}
      </span>
    ),
  },
  {
    key: "carrier",
    header: "Carrier",
    render: (s) => (
      <span className="text-gray-700">{s.carrier ?? "---"}</span>
    ),
  },
  {
    key: "tracking",
    header: "Tracking",
    render: (s) =>
      s.trackingNumber ? (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-gray-600">
            {s.trackingNumber.length > 16
              ? s.trackingNumber.slice(0, 16) + "..."
              : s.trackingNumber}
          </span>
          {s.trackingUrl && (
            <a
              href={s.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-brand-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      ) : (
        <span className="text-gray-400">---</span>
      ),
  },
  {
    key: "status",
    header: "Status",
    render: (s) => <ShipmentStatusBadge status={s.status} />,
  },
  {
    key: "created",
    header: "Created",
    sortable: true,
    render: (s) => (
      <span className="text-gray-500">{formatDate(s.createdAt)}</span>
    ),
  },
];

export function ShipmentTable() {
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={mockShipments}
      keyExtractor={(s) => s.id}
      onRowClick={(s) => router.push(`/shipments/${s.id}`)}
      emptyMessage="No shipments found"
    />
  );
}
