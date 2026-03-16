// =============================================================================
// Webhook Service (Outbound Delivery)
// =============================================================================
// Manages merchant-configured webhook endpoints and delivery.
//
// Flow:
// 1. Outbox poller picks up a domain event (e.g. "order.synced")
// 2. It dispatches to the webhook delivery BullMQ queue
// 3. The webhook worker calls this service to deliver to all matching endpoints
// 4. For each endpoint subscribed to this event type:
//    a. Sign the payload with the endpoint's HMAC secret
//    b. POST to the endpoint URL with retry
//    c. Record the delivery attempt
//    d. On persistent failure, increment the endpoint's failure count
//    e. Auto-disable endpoint after 10 consecutive failures
//
// Merchants verify our signatures using the X-MerchantFlow-Signature header.
// Format: sha256=<hex> (same as GitHub webhooks).

import type { PrismaClient, Prisma, WebhookEndpoint } from "@prisma/client";
import { signWebhookPayload } from "../../lib/hmac/index.js";
import { withRetry } from "../../lib/retry/index.js";

const MAX_CONSECUTIVE_FAILURES = 10;

export interface WebhookEvent {
  eventType: string; // "order.synced", "shipment.shipped", etc.
  payload: Record<string, unknown>;
  storeId: string;
}

export class WebhookService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Registers a new webhook endpoint for a store.
   */
  async createEndpoint(
    storeId: string,
    input: { url: string; secret: string; events: string[] }
  ): Promise<WebhookEndpoint> {
    return this.prisma.webhookEndpoint.create({
      data: {
        storeId,
        url: input.url,
        secret: input.secret,
        events: input.events,
        isActive: true,
      },
    });
  }

  /**
   * Delivers a webhook event to all matching active endpoints for the store.
   *
   * Called by the webhook delivery BullMQ worker. This method handles:
   * - Finding matching endpoints (subscribed to this event type)
   * - Signing the payload
   * - HTTP delivery with retry
   * - Recording success/failure
   * - Auto-disabling broken endpoints
   */
  async deliverEvent(event: WebhookEvent): Promise<void> {
    // Find all active endpoints for this store that subscribe to this event
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        storeId: event.storeId,
        isActive: true,
        events: { has: event.eventType },
      },
    });

    // Deliver to each endpoint independently — one failure should not block others
    const deliveryPromises = endpoints.map((endpoint) =>
      this.deliverToEndpoint(endpoint, event).catch((err) => {
        // Log but don't throw — other endpoints should still receive the event
        console.error(
          `Webhook delivery failed for endpoint ${endpoint.id}: ${err.message}`
        );
      })
    );

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Delivers to a single endpoint with retry and failure tracking.
   */
  private async deliverToEndpoint(
    endpoint: WebhookEndpoint,
    event: WebhookEvent
  ): Promise<void> {
    const payloadString = JSON.stringify(event.payload);
    const signature = signWebhookPayload(payloadString, endpoint.secret);

    // Create the delivery record first
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });

    try {
      const response = await withRetry(
        async () => {
          const res = await fetch(endpoint.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-MerchantFlow-Signature": signature,
              "X-MerchantFlow-Event": event.eventType,
              "X-MerchantFlow-Delivery-Id": delivery.id,
              "User-Agent": "MerchantFlow-Webhook/1.0",
            },
            body: payloadString,
            signal: AbortSignal.timeout(10_000), // 10s timeout per attempt
          });

          if (!res.ok) {
            const error = new Error(
              `Webhook delivery failed: ${res.status} ${res.statusText}`
            );
            (error as any).status = res.status;
            throw error;
          }

          return res;
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 10_000,
        }
      );

      // Success — update delivery and reset endpoint failure count
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SUCCEEDED",
            httpStatus: response.status,
            attemptCount: 1,
            lastAttemptAt: new Date(),
            completedAt: new Date(),
          },
        }),
        this.prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: {
            failureCount: 0,
            lastSucceededAt: new Date(),
          },
        }),
      ]);
    } catch (error) {
      // Failed after all retries — update delivery and increment failure count
      const newFailureCount = endpoint.failureCount + 1;
      const shouldDisable = newFailureCount >= MAX_CONSECUTIVE_FAILURES;

      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            attemptCount: 3,
            lastAttemptAt: new Date(),
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        }),
        this.prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: {
            failureCount: newFailureCount,
            lastFailedAt: new Date(),
            ...(shouldDisable && {
              isActive: false,
              disabledAt: new Date(),
              disabledReason: `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
            }),
          },
        }),
      ]);
    }
  }

  /**
   * Lists webhook endpoints for a store.
   */
  async listEndpoints(storeId: string): Promise<WebhookEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }
}
