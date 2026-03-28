import type { FastifyInstance } from "fastify";
import { OrderService } from "../modules/order/order.service.js";
import { ShipmentService } from "../modules/shipment/shipment.service.js";

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;
  const orderService = new OrderService(prisma);
  const shipmentService = new ShipmentService(prisma);

  app.get<{
    Querystring: {
      cursor?: string;
      limit?: string;
      fulfillmentStatus?: string;
    };
  }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            cursor: { type: "string", format: "uuid" },
            limit: { type: "string", pattern: "^[0-9]+$" },
            fulfillmentStatus: {
              type: "string",
              enum: [
                "UNFULFILLED",
                "PARTIALLY_FULFILLED",
                "FULFILLED",
                "RESTOCKED",
              ],
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "array" },
              pagination: {
                type: "object",
                properties: {
                  cursor: { type: ["string", "null"] },
                  hasMore: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;
      const result = await orderService.listByStore(storeId, request.query);
      return reply.status(200).send(result);
    }
  );

  app.get<{ Params: { orderId: string } }>(
    "/:orderId",
    {
      schema: {
        params: {
          type: "object",
          required: ["orderId"],
          properties: {
            orderId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;
      const order = await orderService.getById(storeId, request.params.orderId);
      return reply.status(200).send({ data: order });
    }
  );

  app.post<{
    Params: { orderId: string };
    Body: {
      carrier?: string;
      service?: string;
      weightGrams?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      customsDeclarationValue?: number;
      customsCurrency?: string;
    };
  }>(
    "/:orderId/shipments",
    {
      schema: {
        params: {
          type: "object",
          required: ["orderId"],
          properties: {
            orderId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          properties: {
            carrier: { type: "string" },
            service: { type: "string" },
            weightGrams: { type: "number", minimum: 1 },
            lengthCm: { type: "number", minimum: 0.1 },
            widthCm: { type: "number", minimum: 0.1 },
            heightCm: { type: "number", minimum: 0.1 },
            customsDeclarationValue: { type: "number", minimum: 0 },
            customsCurrency: { type: "string", minLength: 3, maxLength: 3 },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;

      const shipment = await shipmentService.create({
        storeId,
        orderId: request.params.orderId,
        carrier: request.body.carrier,
        service: request.body.service,
        weightGrams: request.body.weightGrams,
        lengthCm: request.body.lengthCm,
        widthCm: request.body.widthCm,
        heightCm: request.body.heightCm,
        customsDeclarationValue: request.body.customsDeclarationValue,
        customsCurrency: request.body.customsCurrency,
      });

      return reply.status(202).send({
        data: shipment,
        message:
          "Shipment created. Label generation is in progress. " +
          "Poll GET /api/v1/shipments/:id to check status.",
      });
    }
  );

  app.get<{ Params: { orderId: string } }>(
    "/:orderId/shipments",
    {
      schema: {
        params: {
          type: "object",
          required: ["orderId"],
          properties: {
            orderId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;
      const shipments = await shipmentService.listByOrder(
        storeId,
        request.params.orderId
      );
      return reply.status(200).send({ data: shipments });
    }
  );
}
