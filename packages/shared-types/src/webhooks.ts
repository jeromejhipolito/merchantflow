export type WebhookDeliveryStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "DEAD";

export interface WebhookEndpoint {
  id: string;
  storeId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  createdAt: string;
}

export interface CreateWebhookEndpointInput {
  url: string;
  events: string[];
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// Shopify webhook topics we handle
export type ShopifyWebhookTopic =
  | "orders/create"
  | "orders/updated"
  | "orders/fulfilled"
  | "products/create"
  | "products/update"
  | "products/delete"
  | "app/uninstalled";
