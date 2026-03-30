import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShipmentService, type CreateShipmentInput } from "../shipment.service.js";
import { AppError, ErrorCode } from "../../../lib/errors/index.js";

vi.mock("../../../lib/outbox/index.js", () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue(undefined),
}));

import { writeOutboxEvent } from "../../../lib/outbox/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildPrisma() {
  const inner = {
    order: {
      findFirst: vi.fn(),
    },
    shipment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    outboxEvent: {
      create: vi.fn(),
    },
  };

  return {
    ...inner,
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(inner)),
  } as any;
}

let prisma: ReturnType<typeof buildPrisma>;

function baseInput(overrides: Partial<CreateShipmentInput> = {}): CreateShipmentInput {
  return {
    storeId: "store-1",
    orderId: "order-1",
    carrier: "USPS",
    service: "Priority",
    weightGrams: 500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ShipmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma = buildPrisma();
  });

  // ========================================================================
  // create
  // ========================================================================
  describe("createShipment", () => {
    it("should create a shipment in PENDING state when order is fulfillable", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        storeId: "store-1",
        financialStatus: "PAID",
        fulfillmentStatus: "UNFULFILLED",
        orderNumber: "#1001",
        lineItems: [],
        shipments: [],
      });
      prisma.shipment.create.mockResolvedValue({
        id: "ship-1",
        status: "PENDING",
        storeId: "store-1",
        orderId: "order-1",
      });

      const service = new ShipmentService(prisma);
      const result = await service.create(baseInput());

      expect(result.status).toBe("PENDING");
      expect(prisma.shipment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: "store-1",
          orderId: "order-1",
          carrier: "USPS",
          status: "PENDING",
        }),
      });
    });

    it("should throw NOT_FOUND when the order does not exist", async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      const service = new ShipmentService(prisma);

      await expect(service.create(baseInput())).rejects.toThrow(AppError);
      await expect(service.create(baseInput())).rejects.toMatchObject({
        code: ErrorCode.ORDER_NOT_FOUND,
      });
    });

    it("should reject shipment when financial status is not PAID or AUTHORIZED", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        financialStatus: "PENDING",
        fulfillmentStatus: "UNFULFILLED",
        orderNumber: "#1001",
        lineItems: [],
        shipments: [],
      });

      const service = new ShipmentService(prisma);

      await expect(service.create(baseInput())).rejects.toThrow(AppError);
      await expect(service.create(baseInput())).rejects.toMatchObject({
        code: ErrorCode.UNPROCESSABLE,
      });
    });

    it("should reject shipment when order is already fully fulfilled", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        financialStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        orderNumber: "#1001",
        lineItems: [],
        shipments: [],
      });

      const service = new ShipmentService(prisma);

      await expect(service.create(baseInput())).rejects.toThrow(AppError);
      await expect(service.create(baseInput())).rejects.toMatchObject({
        code: ErrorCode.ORDER_ALREADY_FULFILLED,
      });
    });

    it("should write an outbox event for shipment.created", async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        financialStatus: "AUTHORIZED",
        fulfillmentStatus: "UNFULFILLED",
        orderNumber: "#1001",
        lineItems: [],
        shipments: [],
      });
      prisma.shipment.create.mockResolvedValue({
        id: "ship-1",
        status: "PENDING",
        storeId: "store-1",
        orderId: "order-1",
      });

      const service = new ShipmentService(prisma);
      await service.create(baseInput());

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: "store-1",
          aggregateType: "Shipment",
          aggregateId: "ship-1",
          eventType: "shipment.created",
        })
      );
    });
  });

  // ========================================================================
  // transition
  // ========================================================================
  describe("transitionStatus", () => {
    it("should succeed for a valid transition (PENDING -> LABEL_GENERATING)", async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: "ship-1",
        storeId: "store-1",
        orderId: "order-1",
        status: "PENDING",
      });
      prisma.shipment.update.mockResolvedValue({
        id: "ship-1",
        status: "LABEL_GENERATING",
        orderId: "order-1",
        trackingNumber: null,
      });

      const service = new ShipmentService(prisma);
      const result = await service.transition("store-1", "ship-1", "LABEL_GENERATING" as any);

      expect(result.status).toBe("LABEL_GENERATING");
      expect(prisma.shipment.update).toHaveBeenCalledWith({
        where: { id: "ship-1" },
        data: expect.objectContaining({ status: "LABEL_GENERATING" }),
      });
    });

    it("should throw INVALID_SHIPMENT_TRANSITION for invalid transition", async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: "ship-1",
        storeId: "store-1",
        orderId: "order-1",
        status: "PENDING",
      });

      const service = new ShipmentService(prisma);

      await expect(
        service.transition("store-1", "ship-1", "DELIVERED" as any)
      ).rejects.toThrow(AppError);
      await expect(
        service.transition("store-1", "ship-1", "DELIVERED" as any)
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_SHIPMENT_TRANSITION,
      });
    });

    it("should throw NOT_FOUND when shipment does not exist", async () => {
      prisma.shipment.findFirst.mockResolvedValue(null);

      const service = new ShipmentService(prisma);

      await expect(
        service.transition("store-1", "missing-id", "SHIPPED" as any)
      ).rejects.toThrow(AppError);
      await expect(
        service.transition("store-1", "missing-id", "SHIPPED" as any)
      ).rejects.toMatchObject({
        code: ErrorCode.SHIPMENT_NOT_FOUND,
      });
    });

    it("should set shippedAt timestamp when transitioning to SHIPPED", async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: "ship-1",
        storeId: "store-1",
        orderId: "order-1",
        status: "LABEL_READY",
      });
      prisma.shipment.update.mockResolvedValue({
        id: "ship-1",
        status: "SHIPPED",
        orderId: "order-1",
        trackingNumber: "TRACK-123",
      });

      const service = new ShipmentService(prisma);
      await service.transition("store-1", "ship-1", "SHIPPED" as any, {
        trackingNumber: "TRACK-123",
      });

      const updateArgs = prisma.shipment.update.mock.calls[0][0];
      expect(updateArgs.data.shippedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.trackingNumber).toBe("TRACK-123");
    });

    it("should write an outbox event for status transitions that emit events", async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: "ship-1",
        storeId: "store-1",
        orderId: "order-1",
        status: "LABEL_READY",
      });
      prisma.shipment.update.mockResolvedValue({
        id: "ship-1",
        status: "SHIPPED",
        orderId: "order-1",
        trackingNumber: "TRACK-123",
      });

      const service = new ShipmentService(prisma);
      await service.transition("store-1", "ship-1", "SHIPPED" as any, {
        trackingNumber: "TRACK-123",
      });

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: "store-1",
          aggregateType: "Shipment",
          aggregateId: "ship-1",
          eventType: "shipment.shipped",
        })
      );
    });
  });

  // ========================================================================
  // shipShipment (combined transition + tracking)
  // ========================================================================
  describe("shipShipment (transition to SHIPPED with tracking)", () => {
    it("should set tracking number and transition to SHIPPED in one call", async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: "ship-1",
        storeId: "store-1",
        orderId: "order-1",
        status: "LABEL_READY",
      });
      prisma.shipment.update.mockResolvedValue({
        id: "ship-1",
        status: "SHIPPED",
        trackingNumber: "1Z999AA10123456784",
        orderId: "order-1",
      });

      const service = new ShipmentService(prisma);
      const result = await service.transition("store-1", "ship-1", "SHIPPED" as any, {
        trackingNumber: "1Z999AA10123456784",
        trackingUrl: "https://tracking.example.com/1Z999AA10123456784",
      });

      expect(result.status).toBe("SHIPPED");
      expect(result.trackingNumber).toBe("1Z999AA10123456784");

      const updateData = prisma.shipment.update.mock.calls[0][0].data;
      expect(updateData.trackingNumber).toBe("1Z999AA10123456784");
      expect(updateData.trackingUrl).toBe("https://tracking.example.com/1Z999AA10123456784");
    });
  });

  // ========================================================================
  // getById
  // ========================================================================
  describe("getById", () => {
    it("should return shipment by id and storeId", async () => {
      const shipment = { id: "ship-1", storeId: "store-1" };
      prisma.shipment.findFirst.mockResolvedValue(shipment);

      const service = new ShipmentService(prisma);
      const result = await service.getById("store-1", "ship-1");

      expect(result).toEqual(shipment);
    });

    it("should throw SHIPMENT_NOT_FOUND for missing shipment", async () => {
      prisma.shipment.findFirst.mockResolvedValue(null);

      const service = new ShipmentService(prisma);

      await expect(
        service.getById("store-1", "missing")
      ).rejects.toMatchObject({
        code: ErrorCode.SHIPMENT_NOT_FOUND,
      });
    });
  });
});
