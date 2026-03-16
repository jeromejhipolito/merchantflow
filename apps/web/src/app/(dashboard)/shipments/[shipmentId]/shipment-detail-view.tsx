"use client";

import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, Truck } from "lucide-react";
import { useShipment, useShipShipment } from "@/hooks/use-shipments";
import { ShipmentTracker } from "@/components/shipments/shipment-tracker";
import { ShipmentStatusBadge } from "@/components/shipments/shipment-status-badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { mockOrders } from "@/lib/mock-data";
import { useState } from "react";
import { toast } from "sonner";

export function ShipmentDetailView({
  shipmentId,
}: {
  shipmentId: string;
}) {
  const { data: shipment, isLoading, error } = useShipment(shipmentId);
  const shipMutation = useShipShipment();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium text-gray-900">
          Shipment not found
        </p>
        <Link href="/shipments" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Shipments
          </Button>
        </Link>
      </div>
    );
  }

  const order = mockOrders.find((o) => o.id === shipment.orderId);

  const handleMarkShipped = async () => {
    if (!trackingNumber.trim()) {
      toast.error("Tracking number is required");
      return;
    }

    try {
      await shipMutation.mutateAsync({
        shipmentId: shipment.id,
        input: {
          trackingNumber: trackingNumber.trim(),
          trackingUrl: trackingUrl.trim() || undefined,
          carrier: shipment.carrier ?? undefined,
        },
      });
      toast.success("Shipment marked as shipped");
    } catch {
      toast.error("Failed to update shipment");
    }
  };

  const canShip =
    shipment.status === "PENDING" ||
    shipment.status === "LABEL_READY" ||
    shipment.status === "LABEL_GENERATING";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/shipments"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Shipments
        </Link>
        <span className="text-sm text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">
          {shipment.id}
        </span>
      </div>

      {/* Tracker */}
      <Card>
        <CardHeader>
          <CardTitle>Tracking Progress</CardTitle>
          <ShipmentStatusBadge status={shipment.status} />
        </CardHeader>
        <CardContent>
          <ShipmentTracker status={shipment.status} />
        </CardContent>
      </Card>

      {/* Shipment Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shipment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Shipment ID</dt>
                <dd className="font-mono text-sm font-medium text-gray-900">
                  {shipment.id}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Order</dt>
                <dd>
                  <Link
                    href={`/orders/${shipment.orderId}`}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    {order?.orderNumber ?? shipment.orderId}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Carrier</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {shipment.carrier ?? "---"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Service</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {shipment.service ?? "---"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Weight</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {shipment.weightGrams
                    ? `${shipment.weightGrams}g`
                    : "---"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Created</dt>
                <dd className="text-sm text-gray-700">
                  {formatDate(shipment.createdAt)}
                </dd>
              </div>
              {shipment.shippedAt && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Shipped</dt>
                  <dd className="text-sm text-gray-700">
                    {formatDate(shipment.shippedAt)}
                  </dd>
                </div>
              )}
              {shipment.deliveredAt && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Delivered</dt>
                  <dd className="text-sm text-gray-700">
                    {formatDate(shipment.deliveredAt)}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Tracking Info */}
          {shipment.trackingNumber && (
            <Card>
              <CardHeader>
                <CardTitle>Tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <span className="font-mono text-sm font-medium text-gray-900">
                    {shipment.trackingNumber}
                  </span>
                  {shipment.trackingUrl && (
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-brand-600 hover:text-brand-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Label Download */}
          {shipment.labelUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Shipping Label</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={shipment.labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full">
                    <Download className="h-4 w-4" />
                    Download Label ({shipment.labelFormat ?? "PDF"})
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}

          {/* Mark as Shipped */}
          {canShip && (
            <Card>
              <CardHeader>
                <CardTitle>Mark as Shipped</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  label="Tracking Number"
                  placeholder="e.g. 9400111899223456789012"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
                <Input
                  label="Tracking URL (optional)"
                  placeholder="https://..."
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                />
                <Button
                  className="w-full"
                  onClick={handleMarkShipped}
                  disabled={shipMutation.isPending}
                >
                  <Truck className="h-4 w-4" />
                  {shipMutation.isPending
                    ? "Updating..."
                    : "Mark as Shipped"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
