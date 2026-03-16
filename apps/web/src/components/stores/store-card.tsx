import type { Store } from "@merchantflow/shared-types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import { mockOrders } from "@/lib/mock-data";
import { Globe, ShoppingCart, Clock, Zap } from "lucide-react";

function getStoreOrderCount(storeId: string): number {
  return mockOrders.filter((o) => o.storeId === storeId).length;
}

const statusVariant: Record<
  string,
  "success" | "warning" | "danger"
> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  UNINSTALLED: "danger",
};

export function StoreCard({ store }: { store: Store }) {
  const orderCount = getStoreOrderCount(store.id);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <Globe className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{store.name}</h3>
              <p className="text-sm text-gray-500">{store.shopifyDomain}</p>
            </div>
          </div>
          <Badge variant={statusVariant[store.status] ?? "default"}>
            {store.status}
          </Badge>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {orderCount}
              </p>
              <p className="text-xs text-gray-500">Orders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {store.currency}
              </p>
              <p className="text-xs text-gray-500">Currency</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {formatRelativeTime(store.updatedAt)}
              </p>
              <p className="text-xs text-gray-500">Last Sync</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
