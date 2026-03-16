"use client";

import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { useOrder } from "@/hooks/use-orders";
import { OrderDetailCard } from "@/components/orders/order-detail-card";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { CreateShipmentForm } from "@/components/shipments/create-shipment-form";
import { ShipmentStatusBadge } from "@/components/shipments/shipment-status-badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import type { ShipmentStatus } from "@merchantflow/shared-types";

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { data: order, isLoading, error } = useOrder(orderId);
  const [showShipmentForm, setShowShipmentForm] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium text-gray-900">Order not found</p>
        <p className="mt-1 text-sm text-gray-500">
          The order you are looking for does not exist.
        </p>
        <Link href="/orders" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/orders"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Orders
        </Link>
        <span className="text-sm text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">
          {order.orderNumber}
        </span>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Order Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderTimeline order={order} />
        </CardContent>
      </Card>

      {/* Order Detail */}
      <OrderDetailCard order={order} />

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Qty
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Fulfilled
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {item.title}
                      </p>
                      {item.variantTitle && (
                        <p className="text-xs text-gray-500">
                          {item.variantTitle}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-gray-500">
                        {item.sku ?? "---"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-700">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-700">
                      {formatCurrency(item.unitPrice, order.currencyCode)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(item.totalPrice, order.currencyCode)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <span
                        className={
                          item.fulfilledQuantity >= item.quantity
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }
                      >
                        {item.fulfilledQuantity}/{item.quantity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Shipments */}
      {order.shipments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {order.shipments.map((shipment) => (
                <Link
                  key={shipment.id}
                  href={`/shipments/${shipment.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-4 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {shipment.id}
                      </p>
                      <p className="text-xs text-gray-500">
                        {shipment.carrier ?? "No carrier"}{" "}
                        {shipment.trackingNumber
                          ? `- ${shipment.trackingNumber}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <ShipmentStatusBadge
                    status={shipment.status as ShipmentStatus}
                  />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Shipment */}
      {order.fulfillmentStatus !== "FULFILLED" && (
        <div>
          {showShipmentForm ? (
            <CreateShipmentForm
              orderId={order.id}
              onSuccess={() => setShowShipmentForm(false)}
            />
          ) : (
            <Button
              variant="primary"
              onClick={() => setShowShipmentForm(true)}
            >
              <Package className="h-4 w-4" />
              Create Shipment
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
