// =============================================================================
// Shipment Routes
// =============================================================================
// GET  /api/v1/shipments/:shipmentId — Get shipment details (label status, tracking)
// POST /api/v1/shipments/:shipmentId/ship — Mark as shipped (transition to SHIPPED)
//
// Note: Creating shipments is done via POST /api/v1/orders/:orderId/shipments.
// These routes are for shipment-specific operations after creation.

import type { FastifyInstance } from "fastify";
import { ShipmentService } from "../modules/shipment/shipment.service.js";

export async function registerShipmentRoutes(
  app: FastifyInstance
): Promise<void> {
  const prisma = app.prisma;
  const shipmentService = new ShipmentService(prisma);

  // -------------------------------------------------------------------------
  // GET /api/v1/shipments/:shipmentId — Get shipment details
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // POST /api/v1/shipments/:shipmentId/ship — Mark as shipped
  // -------------------------------------------------------------------------
  // This transition requires the shipment to be in LABEL_READY status.
  // It indicates the merchant has handed the package to the carrier.
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
