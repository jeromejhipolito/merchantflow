"use client";

import { usePathname } from "next/navigation";
import { useStoreSelection } from "@/providers/store-provider";
import { mockStores } from "@/lib/mock-data";
import { Store, Bell } from "lucide-react";

const routeTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/orders": "Orders",
  "/shipments": "Shipments",
  "/stores": "Stores",
  "/activity": "Activity",
  "/settings": "Settings",
};

function getTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname];
  if (pathname.startsWith("/orders/")) return "Order Details";
  if (pathname.startsWith("/shipments/")) return "Shipment Details";
  return "MerchantFlow";
}

export function Topbar() {
  const pathname = usePathname();
  const { selectedStoreId, setSelectedStoreId } = useStoreSelection();
  const title = getTitle(pathname);

  const activeStores = mockStores.filter((s) => s.status === "ACTIVE");
  const currentStore =
    activeStores.find((s) => s.id === selectedStoreId) ?? activeStores[0];

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        {/* Spacer for mobile menu button */}
        <div className="w-8 lg:hidden" />
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Store selector */}
        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
          <Store className="h-4 w-4 text-gray-400" />
          <select
            className="appearance-none border-0 bg-transparent pr-6 text-sm font-medium text-gray-700 focus:outline-none focus:ring-0"
            value={currentStore?.id ?? ""}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            {activeStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>

        {/* Notifications */}
        <button className="relative rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500" />
        </button>

        {/* Avatar */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          JR
        </div>
      </div>
    </header>
  );
}
