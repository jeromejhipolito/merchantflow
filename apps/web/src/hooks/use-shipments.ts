import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Shipment,
  CreateShipmentInput,
  ShipShipmentInput,
} from "@merchantflow/shared-types";
import { apiClient } from "@/lib/api-client";
import { mockShipments } from "@/lib/mock-data";

export function useShipments() {
  return useQuery({
    queryKey: ["shipments"],
    queryFn: async () => {
      try {
        return await apiClient<Shipment[]>("/api/shipments");
      } catch {
        return mockShipments;
      }
    },
  });
}

export function useShipment(shipmentId: string) {
  return useQuery({
    queryKey: ["shipments", shipmentId],
    queryFn: async () => {
      try {
        return await apiClient<Shipment>(`/api/shipments/${shipmentId}`);
      } catch {
        const shipment = mockShipments.find((s) => s.id === shipmentId);
        if (!shipment) throw new Error("Shipment not found");
        return shipment;
      }
    },
    enabled: !!shipmentId,
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateShipmentInput) => {
      try {
        return await apiClient<Shipment>("/api/shipments", {
          method: "POST",
          body: JSON.stringify(input),
        });
      } catch {
        // Mock creation
        const newShipment: Shipment = {
          id: `shp_mock_${Date.now()}`,
          storeId: "store_01HQXYZ1A2B3C4D5E6F7G8H9J0",
          orderId: input.orderId,
          carrier: input.carrier ?? null,
          service: input.service ?? null,
          trackingNumber: null,
          trackingUrl: null,
          labelUrl: null,
          labelFormat: null,
          status: "PENDING",
          weightGrams: input.weightGrams ?? null,
          shippedAt: null,
          deliveredAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return newShipment;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useShipShipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shipmentId,
      input,
    }: {
      shipmentId: string;
      input: ShipShipmentInput;
    }) => {
      try {
        return await apiClient<Shipment>(
          `/api/shipments/${shipmentId}/ship`,
          { method: "POST", body: JSON.stringify(input) }
        );
      } catch {
        const shipment = mockShipments.find((s) => s.id === shipmentId);
        if (!shipment) throw new Error("Shipment not found");
        return {
          ...shipment,
          status: "SHIPPED" as const,
          trackingNumber: input.trackingNumber,
          trackingUrl: input.trackingUrl ?? null,
          shippedAt: new Date().toISOString(),
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
}
