import type { FastifyInstance } from "fastify";
import { ShipmentService } from "../modules/shipment/shipment.service.js";

export async function registerShipmentRoutes(
  app: FastifyInstance
): Promise<void> {
  const prisma = app.prisma;
  const shipmentService = new ShipmentService(prisma);

  app.get<{ Params: { shipmentId: string } }>(
    "/:shipmentId",
    {
      schema: {
        params: {
          type: "object",
          required: ["shipmentId"],
          properties: {
            shipmentId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;
      const shipment = await shipmentService.getById(
        storeId,
        request.params.shipmentId
      );
      return reply.status(200).send({ data: shipment });
    }
  );

  app.post<{
    Params: { shipmentId: string };
    Body: { trackingNumber?: string };
  }>(
    "/:shipmentId/ship",
    {
      schema: {
        params: {
          type: "object",
          required: ["shipmentId"],
          properties: {
            shipmentId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          properties: {
            trackingNumber: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const storeId = request.storeId;
      const shipment = await shipmentService.transition(
        storeId,
        request.params.shipmentId,
        "SHIPPED",
        {
          trackingNumber: request.body.trackingNumber,
        }
      );
      return reply.status(200).send({ data: shipment });
    }
  );
}
