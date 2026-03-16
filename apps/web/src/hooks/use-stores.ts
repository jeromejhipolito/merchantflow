import { useQuery } from "@tanstack/react-query";
import type { Store } from "@merchantflow/shared-types";
import { apiClient } from "@/lib/api-client";
import { mockStores } from "@/lib/mock-data";

export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      try {
        return await apiClient<Store[]>("/api/stores");
      } catch {
        return mockStores;
      }
    },
  });
}

export function useStore(storeId: string) {
  return useQuery({
    queryKey: ["stores", storeId],
    queryFn: async () => {
      try {
        return await apiClient<Store>(`/api/stores/${storeId}`);
      } catch {
        const store = mockStores.find((s) => s.id === storeId);
        if (!store) throw new Error("Store not found");
        return store;
      }
    },
    enabled: !!storeId,
  });
}
