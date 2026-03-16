"use client";

import { ShoppingCart, DollarSign, Truck, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EventFeed } from "@/components/activity/event-feed";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { FinancialStatusBadge } from "@/components/orders/financial-status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  mockOrders,
  mockActivityEvents,
  mockDashboardStats,
} from "@/lib/mock-data";
import type { Order } from "@merchantflow/shared-types";
import { useRouter } from "next/navigation";

const recentOrderColumns: Column<Order>[] = [
  {
    key: "order",
    header: "Order",
    render: (o) => (
      <span className="font-medium text-gray-900">{o.orderNumber}</span>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    render: (o) => (
      <span>
        {o.customerFirstName} {o.customerLastName}
      </span>
    ),
  },
  {
    key: "total",
    header: "Total",
    render: (o) => (
      <span className="font-medium">
        {formatCurrency(o.totalPrice, o.currencyCode)}
      </span>
    ),
  },
  {
    key: "payment",
    header: "Payment",
    render: (o) => <FinancialStatusBadge status={o.financialStatus} />,
  },
  {
    key: "status",
    header: "Status",
    render: (o) => <OrderStatusBadge status={o.fulfillmentStatus} />,
  },
  {
    key: "date",
    header: "Date",
    render: (o) => (
      <span className="text-gray-500">{formatDate(o.createdAt)}</span>
    ),
  },
];

export function DashboardOverview() {
  const router = useRouter();
  const stats = mockDashboardStats;
  const recentOrders = [...mockOrders]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ShoppingCart}
          label="Total Orders"
          value={stats.totalOrders.toLocaleString()}
          trend={stats.ordersChange}
          trendLabel="vs last week"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue"
          value={formatCurrency(stats.totalRevenue)}
          trend={stats.revenueChange}
          trendLabel="vs last week"
        />
        <StatCard
          icon={Truck}
          label="Pending Shipments"
          value={stats.pendingShipments.toString()}
          trend={stats.shipmentsChange}
          trendLabel="vs last week"
        />
        <StatCard
          icon={CheckCircle2}
          label="Fulfilled Rate"
          value={`${stats.fulfilledRate}%`}
          trend={stats.fulfilledRateChange}
          trendLabel="vs last week"
        />
      </div>

      {/* Recent Orders + Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
              <button
                onClick={() => router.push("/orders")}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={recentOrderColumns}
                data={recentOrders}
                keyExtractor={(o) => o.id}
                onRowClick={(o) => router.push(`/orders/${o.id}`)}
                className="border-0 shadow-none"
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Activity Feed</CardTitle>
              <button
                onClick={() => router.push("/activity")}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all
              </button>
            </CardHeader>
            <CardContent>
              <EventFeed events={mockActivityEvents} maxItems={5} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
