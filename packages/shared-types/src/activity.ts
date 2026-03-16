export type ActivityEventType =
  | "order.created"
  | "order.updated"
  | "order.fulfilled"
  | "shipment.created"
  | "shipment.shipped"
  | "shipment.delivered"
  | "product.synced"
  | "webhook.received"
  | "webhook.delivered"
  | "webhook.failed"
  | "sync.completed";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  storeId: string;
  aggregateType: string;
  aggregateId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
