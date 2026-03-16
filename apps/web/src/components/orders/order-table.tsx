"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Order } from "@merchantflow/shared-types";
import { DataTable, type Column } from "@/components/ui/data-table";
import { OrderStatusBadge } from "./order-status-badge";
import { FinancialStatusBadge } from "./financial-status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { mockOrders } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";

const PAGE_SIZE = 10;

const columns: Column<Order>[] = [
  {
    key: "orderNumber",
    header: "Order",
    sortable: true,
    render: (order) => (
      <span className="font-medium text-gray-900">{order.orderNumber}</span>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    render: (order) => (
      <div>
        <p className="font-medium text-gray-900">
          {order.customerFirstName} {order.customerLastName}
        </p>
        <p className="text-xs text-gray-500">{order.customerEmail}</p>
      </div>
    ),
  },
  {
    key: "total",
    header: "Total",
    sortable: true,
    render: (order) => (
      <span className="font-medium">
        {formatCurrency(order.totalPrice, order.currencyCode)}
      </span>
    ),
  },
  {
    key: "financial",
    header: "Payment",
    render: (order) => (
      <FinancialStatusBadge status={order.financialStatus} />
    ),
  },
  {
    key: "fulfillment",
    header: "Fulfillment",
    render: (order) => (
      <OrderStatusBadge status={order.fulfillmentStatus} />
    ),
  },
  {
    key: "date",
    header: "Date",
    sortable: true,
    render: (order) => (
      <span className="text-gray-500">{formatDate(order.createdAt)}</span>
    ),
  },
];

export function OrderTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(0);

  const search = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const financial = searchParams.get("financial") ?? "";

  const filteredOrders = useMemo(() => {
    return mockOrders.filter((order) => {
      if (status && order.fulfillmentStatus !== status) return false;
      if (financial && order.financialStatus !== financial) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          order.orderNumber.toLowerCase().includes(q) ||
          order.customerEmail?.toLowerCase().includes(q) ||
          `${order.customerFirstName} ${order.customerLastName}`
            .toLowerCase()
            .includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [search, status, financial]);

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paginatedOrders = filteredOrders.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={paginatedOrders}
        keyExtractor={(order) => order.id}
        onRowClick={(order) => router.push(`/orders/${order.id}`)}
        emptyMessage="No orders match your filters"
      />

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {page * PAGE_SIZE + 1} to{" "}
          {Math.min((page + 1) * PAGE_SIZE, filteredOrders.length)} of{" "}
          {filteredOrders.length} orders
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
