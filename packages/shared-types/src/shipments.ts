export type ShipmentStatus =
  | "PENDING"
  | "LABEL_GENERATING"
  | "LABEL_READY"
  | "LABEL_FAILED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";

export interface Shipment {
  id: string;
  storeId: string;
  orderId: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  labelFormat: string | null;
  status: ShipmentStatus;
  weightGrams: number | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShipmentInput {
  orderId: string;
  carrier?: string;
  service?: string;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface ShipShipmentInput {
  trackingNumber: string;
  trackingUrl?: string;
  carrier?: string;
}
