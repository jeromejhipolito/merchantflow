import type { Order } from "@merchantflow/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "./order-status-badge";
import { FinancialStatusBadge } from "./financial-status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { User, Mail, Phone, MapPin } from "lucide-react";

export function OrderDetailCard({ order }: { order: Order }) {
  const fullName = [order.customerFirstName, order.customerLastName]
    .filter(Boolean)
    .join(" ");
  const addr = order.shippingAddress;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Order info */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Order {order.orderNumber}</CardTitle>
          <div className="flex items-center gap-2">
            <FinancialStatusBadge status={order.financialStatus} />
            <OrderStatusBadge status={order.fulfillmentStatus} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">
                Subtotal
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {formatCurrency(order.subtotalPrice, order.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">
                Tax
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {formatCurrency(order.totalTax, order.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">
                Shipping
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {formatCurrency(order.totalShipping, order.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">
                Discount
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                -{formatCurrency(order.totalDiscount, order.currencyCode)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase text-gray-500">
                Total
              </dt>
              <dd className="mt-1 text-lg font-bold text-gray-900">
                {formatCurrency(order.totalPrice, order.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">
                Created
              </dt>
              <dd className="mt-1 text-sm text-gray-700">
                {formatDate(order.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500">
                Updated
              </dt>
              <dd className="mt-1 text-sm text-gray-700">
                {formatDate(order.updatedAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Customer + Shipping */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fullName && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <User className="h-4 w-4 text-gray-400" />
                {fullName}
              </div>
            )}
            {order.customerEmail && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail className="h-4 w-4 text-gray-400" />
                {order.customerEmail}
              </div>
            )}
            {order.customerPhone && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                {order.customerPhone}
              </div>
            )}
          </CardContent>
        </Card>

        {addr && (
          <Card>
            <CardHeader>
              <CardTitle>Shipping Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  {addr.line1 && <p>{addr.line1}</p>}
                  {addr.line2 && <p>{addr.line2}</p>}
                  <p>
                    {[addr.city, addr.province, addr.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {addr.countryCode && <p>{addr.countryCode}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
