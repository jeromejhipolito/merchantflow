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

  async deliverEvent(event: WebhookEvent): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        storeId: event.storeId,
        isActive: true,
        events: { has: event.eventType },
      },
    });

    const deliveryPromises = endpoints.map((endpoint) =>
      this.deliverToEndpoint(endpoint, event).catch((err) => {
        console.error(
          `Webhook delivery failed for endpoint ${endpoint.id}: ${err.message}`
        );
      })
    );

    await Promise.allSettled(deliveryPromises);
  }

  private async deliverToEndpoint(
    endpoint: WebhookEndpoint,
    event: WebhookEvent
  ): Promise<void> {
    const payloadString = JSON.stringify(event.payload);
    const signature = signWebhookPayload(payloadString, endpoint.secret);

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
            signal: AbortSignal.timeout(10_000),
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

  async listEndpoints(storeId: string): Promise<WebhookEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }
}
