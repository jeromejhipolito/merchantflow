// =============================================================================
// Webhook Endpoint Management Routes
// =============================================================================
// Merchants use these routes to configure their webhook endpoints.
// We will deliver events to these URLs when domain events occur.
//
// POST /api/v1/webhooks — Register a new webhook endpoint
// GET  /api/v1/webhooks — List registered webhook endpoints
// DELETE /api/v1/webhooks/:endpointId — Deactivate a webhook endpoint

import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { WebhookService } from "../modules/webhook/webhook.service.js";
import { validationError, notFound } from "../lib/errors/index.js";

const VALID_EVENT_TYPES = [
  "order.synced",
  "shipment.created",
  "shipment.label_ready",
  "shipment.shipped",
  "shipment.in_transit",
  "shipment.delivered",
  "shipment.failed",
  "shipment.label_failed",
  "store.installed",
  "store.reinstalled",
  "store.uninstalled",
];

export async function registerWebhookRoutes(
  app: FastifyInstance
): Promise<void> {
  const prisma = app.prisma;
  const webhookService = new WebhookService(prisma);

  // -------------------------------------------------------------------------
  // POST /api/v1/webhooks — Register a webhook endpoint
  // -------------------------------------------------------------------------
  app.post<{
    Body: {
      url: string;
      events: string[];
    };
  }>(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["url", "events"],
          properties: {
            url: { type: "string", format: "uri" },
            events: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;

      // Validate URL is HTTPS in production
      if (
        process.env.NODE_ENV === "production" &&
        !request.body.url.startsWith("https://")
      ) {
        throw validationError(
          "Webhook URL must use HTTPS in production.",
          { url: request.body.url }
        );
      }

      // Validate event types
      const invalidEvents = request.body.events.filter(
        (e) => !VALID_EVENT_TYPES.includes(e)
      );
      if (invalidEvents.length > 0) {
        throw validationError(
          `Invalid event types: ${invalidEvents.join(", ")}`,
          { validEvents: VALID_EVENT_TYPES, invalidEvents }
        );
      }

      // Generate a signing secret for this endpoint
      const secret = randomBytes(32).toString("hex");

      const endpoint = await webhookService.createEndpoint(storeId, {
        url: request.body.url,
        secret,
        events: request.body.events,
      });

      // Return the secret ONCE — the merchant must store it.
      // We never return the secret again after creation.
      return reply.status(201).send({
        data: {
          id: endpoint.id,
          url: endpoint.url,
          events: endpoint.events,
          isActive: endpoint.isActive,
          createdAt: endpoint.createdAt,
          // This is the ONLY time we expose the signing secret
          secret,
        },
        message:
          "Webhook endpoint registered. Save the signing secret — " +
          "it will not be shown again. Use it to verify X-MerchantFlow-Signature headers.",
      });
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/webhooks — List webhook endpoints
  // -------------------------------------------------------------------------
  app.get("/", async (request, reply) => {
    const storeId = request.storeId;
    const endpoints = await webhookService.listEndpoints(storeId);

    // Strip secrets from the response — never expose after creation
    const sanitized = endpoints.map((e) => ({
      id: e.id,
      url: e.url,
      events: e.events,
      isActive: e.isActive,
      failureCount: e.failureCount,
      lastSucceededAt: e.lastSucceededAt,
      lastFailedAt: e.lastFailedAt,
      disabledAt: e.disabledAt,
      disabledReason: e.disabledReason,
      createdAt: e.createdAt,
    }));

    return reply.status(200).send({ data: sanitized });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/webhooks/:endpointId — Deactivate a webhook endpoint
  // -------------------------------------------------------------------------
  app.delete<{ Params: { endpointId: string } }>(
    "/:endpointId",
    {
      schema: {
        params: {
          type: "object",
          required: ["endpointId"],
          properties: {
            endpointId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;

      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: request.params.endpointId, storeId },
      });

      if (!endpoint) {
        throw notFound("WebhookEndpoint", request.params.endpointId);
      }

      await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { isActive: false, disabledAt: new Date(), disabledReason: "Manually deactivated by merchant" },
      });

      return reply.status(200).send({
        data: { id: endpoint.id, isActive: false },
        message: "Webhook endpoint deactivated.",
      });
    }
  );
}
