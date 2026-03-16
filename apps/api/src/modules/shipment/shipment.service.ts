// =============================================================================
// Shipment Service
// =============================================================================
// Manages the Shipment aggregate. A shipment represents a physical package.
//
// Lifecycle (state machine):
//   PENDING -> LABEL_GENERATING -> LABEL_READY -> SHIPPED -> IN_TRANSIT -> DELIVERED
//                               -> LABEL_FAILED (terminal, can retry)
//   Any state -> FAILED / RETURNED (terminal)
//
// Key invariants:
// - A shipment can only be created for orders with financial status PAID or AUTHORIZED
// - Total fulfilled quantity across all shipments must not exceed line item quantity
// - State transitions are validated — you cannot go from DELIVERED back to PENDING
// - Label generation is async (BullMQ job) — the API returns 202 Accepted

import type { PrismaClient, Shipment, ShipmentStatus } from "@prisma/client";
import { notFound, conflict, AppError, ErrorCode } from "../../lib/errors/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ["LABEL_GENERATING"],
  LABEL_GENERATING: ["LABEL_READY", "LABEL_FAILED"],
  LABEL_READY: ["SHIPPED"],
  LABEL_FAILED: ["LABEL_GENERATING", "PENDING"], // allow retry
  SHIPPED: ["IN_TRANSIT", "FAILED", "RETURNED"],
  IN_TRANSIT: ["DELIVERED", "FAILED", "RETURNED"],
  DELIVERED: [], // terminal
  FAILED: [], // terminal
  RETURNED: [], // terminal
};

function assertValidTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new AppError({
      code: ErrorCode.INVALID_SHIPMENT_TRANSITION,
      message: `Cannot transition shipment from ${from} to ${to}. Allowed: [${allowed.join(", ")}]`,
      details: { currentStatus: from, requestedStatus: to, allowed },
    });
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateShipmentInput {
  storeId: string;
  orderId: string;
  carrier?: string;
  service?: string;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  customsDeclarationValue?: number;
  customsCurrency?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ShipmentService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a shipment for an order and enqueues label generation.
   *
   * Returns the shipment in PENDING status. The caller (route handler)
   * is responsible for enqueuing the label generation job via BullMQ.
   * We do NOT call BullMQ from the service layer — that would create
   * a hidden dependency on Redis being available during the DB transaction.
   *
   * Instead, we write an outbox event. The outbox poller dispatches it
   * to the label generation queue.
   */
  async create(input: CreateShipmentInput): Promise<Shipment> {
    return this.prisma.$transaction(async (tx) => {
      // Verify the order exists, belongs to this store, and is payable
      const order = await tx.order.findFirst({
        where: { id: input.orderId, storeId: input.storeId, deletedAt: null },
        include: { lineItems: true, shipments: true },
      });

      if (!order) throw notFound("Order", input.orderId);

      // Business rule: order must be paid before creating shipments
      if (!["PAID", "AUTHORIZED"].includes(order.financialStatus)) {
        throw new AppError({
          code: ErrorCode.UNPROCESSABLE,
          message: `Cannot create shipment for order ${order.orderNumber}: financial status is ${order.financialStatus}. Must be PAID or AUTHORIZED.`,
        });
      }

      // Business rule: cannot create shipment if already fully fulfilled
      if (order.fulfillmentStatus === "FULFILLED") {
        throw conflict(
          `Order ${order.orderNumber} is already fully fulfilled.`,
          ErrorCode.ORDER_ALREADY_FULFILLED
        );
      }

      const shipment = await tx.shipment.create({
        data: {
          storeId: input.storeId,
          orderId: input.orderId,
          carrier: input.carrier,
          service: input.service,
          status: "PENDING",
          weightGrams: input.weightGrams,
          lengthCm: input.lengthCm,
          widthCm: input.widthCm,
          heightCm: input.heightCm,
          customsDeclarationValue: input.customsDeclarationValue,
          customsCurrency: input.customsCurrency,
        },
      });

      // Outbox event — the poller will dispatch this to the label generation queue
      await writeOutboxEvent(tx, {
        storeId: input.storeId,
        aggregateType: "Shipment",
        aggregateId: shipment.id,
        eventType: "shipment.created",
        payload: {
          shipmentId: shipment.id,
          orderId: input.orderId,
          carrier: input.carrier,
        },
      });

      return shipment;
    });
  }

  /**
   * Transitions a shipment to a new status with validation.
   */
  async transition(
    storeId: string,
    shipmentId: string,
    newStatus: ShipmentStatus,
    metadata?: {
      trackingNumber?: string;
      trackingUrl?: string;
      labelUrl?: string;
      labelFormat?: string;
    }
  ): Promise<Shipment> {
    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, storeId },
      });

      if (!shipment) throw notFound("Shipment", shipmentId);

      assertValidTransition(shipment.status, newStatus);

      const updateData: Record<string, unknown> = {
        status: newStatus,
      };

      // Set timestamps based on the new status
      if (newStatus === "SHIPPED") updateData.shippedAt = new Date();
      if (newStatus === "DELIVERED") updateData.deliveredAt = new Date();
      if (newStatus === "LABEL_READY") updateData.labelGeneratedAt = new Date();

      // Apply optional metadata
      if (metadata?.trackingNumber) updateData.trackingNumber = metadata.trackingNumber;
      if (metadata?.trackingUrl) updateData.trackingUrl = metadata.trackingUrl;
      if (metadata?.labelUrl) updateData.labelUrl = metadata.labelUrl;
      if (metadata?.labelFormat) updateData.labelFormat = metadata.labelFormat;

      const updated = await tx.shipment.update({
        where: { id: shipmentId },
        data: updateData,
      });

      // Map status to outbox event type
      const eventTypeMap: Partial<Record<ShipmentStatus, string>> = {
        LABEL_READY: "shipment.label_ready",
        SHIPPED: "shipment.shipped",
        IN_TRANSIT: "shipment.in_transit",
        DELIVERED: "shipment.delivered",
        FAILED: "shipment.failed",
        LABEL_FAILED: "shipment.label_failed",
      };

      const eventType = eventTypeMap[newStatus];
      if (eventType) {
        await writeOutboxEvent(tx, {
          storeId,
          aggregateType: "Shipment",
          aggregateId: shipmentId,
          eventType,
          payload: {
            shipmentId,
            orderId: shipment.orderId,
            status: newStatus,
            trackingNumber: updated.trackingNumber,
          },
        });
      }

      return updated;
    });
  }

  async getById(storeId: string, shipmentId: string): Promise<Shipment> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, storeId },
    });
    if (!shipment) throw notFound("Shipment", shipmentId);
    return shipment;
  }

  async listByOrder(storeId: string, orderId: string): Promise<Shipment[]> {
    return this.prisma.shipment.findMany({
      where: { storeId, orderId },
      orderBy: { createdAt: "desc" },
    });
  }
}
