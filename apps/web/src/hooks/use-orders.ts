import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order, OrderListFilters } from "@merchantflow/shared-types";
import { apiClient } from "@/lib/api-client";
import { mockOrders } from "@/lib/mock-data";

export function useOrders(filters?: OrderListFilters) {
  return useQuery({
    queryKey: ["orders", filters],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (filters?.status) params.set("status", filters.status);
        if (filters?.financialStatus)
          params.set("financialStatus", filters.financialStatus);
        if (filters?.search) params.set("search", filters.search);
        if (filters?.cursor) params.set("cursor", filters.cursor);
        if (filters?.limit) params.set("limit", String(filters.limit));

        const qs = params.toString();
        return await apiClient<Order[]>(`/api/orders${qs ? `?${qs}` : ""}`);
      } catch {
        // Fallback to mock data
        return mockOrders;
      }
    },
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ["orders", orderId],
    queryFn: async () => {
      try {
        return await apiClient<Order>(`/api/orders/${orderId}`);
      } catch {
        // Fallback to mock data
        const order = mockOrders.find((o) => o.id === orderId);
        if (!order) throw new Error("Order not found");
        return order;
      }
    },
    enabled: !!orderId,
  });
}

export function useFulfillOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      try {
        return await apiClient<Order>(`/api/orders/${orderId}/fulfill`, {
          method: "POST",
        });
      } catch {
        // Mock fulfillment
        const order = mockOrders.find((o) => o.id === orderId);
        if (!order) throw new Error("Order not found");
        return { ...order, fulfillmentStatus: "FULFILLED" as const };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
