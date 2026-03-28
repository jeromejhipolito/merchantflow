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

      if (
        process.env.NODE_ENV === "production" &&
        !request.body.url.startsWith("https://")
      ) {
        throw validationError(
          "Webhook URL must use HTTPS in production.",
          { url: request.body.url }
        );
      }

      const invalidEvents = request.body.events.filter(
        (e) => !VALID_EVENT_TYPES.includes(e)
      );
      if (invalidEvents.length > 0) {
        throw validationError(
          `Invalid event types: ${invalidEvents.join(", ")}`,
          { validEvents: VALID_EVENT_TYPES, invalidEvents }
        );
      }

      const secret = randomBytes(32).toString("hex");

      const endpoint = await webhookService.createEndpoint(storeId, {
        url: request.body.url,
        secret,
        events: request.body.events,
      });

      return reply.status(201).send({
        data: {
          id: endpoint.id,
          url: endpoint.url,
          events: endpoint.events,
          isActive: endpoint.isActive,
          createdAt: endpoint.createdAt,
          secret, // only exposed on creation
        },
        message:
          "Webhook endpoint registered. Save the signing secret — " +
          "it will not be shown again. Use it to verify X-MerchantFlow-Signature headers.",
      });
    }
  );

  app.get("/", async (request, reply) => {
    const storeId = request.storeId;
    const endpoints = await webhookService.listEndpoints(storeId);

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
