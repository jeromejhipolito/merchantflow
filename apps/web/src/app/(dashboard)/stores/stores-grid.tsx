"use client";

import { StoreCard } from "@/components/stores/store-card";
import { mockStores } from "@/lib/mock-data";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function StoresGrid() {
  const handleConnect = () => {
    toast.info("Store connection", {
      description:
        "This would open the Shopify OAuth flow to connect a new store.",
    });
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {mockStores.map((store) => (
        <StoreCard key={store.id} store={store} />
      ))}

      {/* Connect Store CTA Card */}
      <button
        onClick={handleConnect}
        className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 transition-colors hover:border-brand-400 hover:bg-brand-50/30"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <Plus className="h-6 w-6 text-gray-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">
            Connect Store
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Add a new Shopify store
          </p>
        </div>
      </button>
    </div>
  );
}
