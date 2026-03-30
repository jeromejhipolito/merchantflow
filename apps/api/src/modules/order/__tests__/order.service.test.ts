import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService } from "../order.service.js";
import { AppError, ErrorCode } from "../../../lib/errors/index.js";

// Mock the outbox module so writeOutboxEvent is a spy we can assert on
vi.mock("../../../lib/outbox/index.js", () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue(undefined),
}));

import { writeOutboxEvent } from "../../../lib/outbox/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildPrisma() {
  return {
    order: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    product: {
      findFirst: vi.fn(),
    },
    lineItem: {
      upsert: vi.fn(),
    },
    outboxEvent: {
      create: vi.fn(),
    },
    // $transaction executes the callback with `tx` = the same mock, so
    // every call inside the callback hits our mocks above.
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb({
        order: { upsert: prisma.order.upsert },
        product: { findFirst: prisma.product.findFirst },
        lineItem: { upsert: prisma.lineItem.upsert },
        outboxEvent: { create: prisma.outboxEvent.create },
      });
    }),
  } as any;
}

let prisma: ReturnType<typeof buildPrisma>;

function sampleInput(overrides: Record<string, unknown> = {}) {
  return {
    storeId: "store-1",
    shopifyOrderId: "shopify-order-100",
    orderNumber: "#1001",
    subtotalPrice: "49.99",
    totalTax: "5.00",
    totalShipping: "10.00",
    totalDiscount: "0.00",
    totalPrice: "64.99",
    currencyCode: "USD",
    financialStatus: "paid",
    fulfillmentStatus: "unfulfilled",
    customer: {
      email: "customer@example.com",
      firstName: "Jane",
      lastName: "Doe",
      phone: "+1234567890",
    },
    shippingAddress: {
      address1: "123 Main St",
      city: "Manila",
      province: "NCR",
      zip: "1000",
      countryCode: "PH",
    },
    lineItems: [
      {
        shopifyLineItemId: "li-1",
        title: "Widget",
        sku: "WGT-001",
        quantity: 2,
        price: "24.99",
      },
    ],
    shopifyCreatedAt: "2026-03-28T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("OrderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma = buildPrisma();
  });

  // ========================================================================
  // upsertFromShopify
  // ========================================================================
  describe("upsertFromShopify", () => {
    it("should create a new order with line items when the order does not exist", async () => {
      const fakeOrder = { id: "order-1", storeId: "store-1", orderNumber: "#1001" };
      prisma.order.upsert.mockResolvedValue(fakeOrder);
      prisma.product.findFirst.mockResolvedValue({ id: "product-1" });
      prisma.lineItem.upsert.mockResolvedValue({ id: "li-1" });

      const service = new OrderService(prisma);
      const input = sampleInput();
      const result = await service.upsertFromShopify(input);

      expect(result).toEqual(fakeOrder);
      expect(prisma.order.upsert).toHaveBeenCalledOnce();

      // Verify the upsert was called with both create and update payloads
      const upsertArgs = prisma.order.upsert.mock.calls[0][0];
      expect(upsertArgs.where.uq_store_shopify_order).toEqual({
        storeId: "store-1",
        shopifyOrderId: "shopify-order-100",
      });
      expect(upsertArgs.create.storeId).toBe("store-1");
      expect(upsertArgs.create.financialStatus).toBe("PAID");
      expect(upsertArgs.create.fulfillmentStatus).toBe("UNFULFILLED");

      // Line item upserted
      expect(prisma.lineItem.upsert).toHaveBeenCalledOnce();
      const liArgs = prisma.lineItem.upsert.mock.calls[0][0];
      expect(liArgs.create.orderId).toBe("order-1");
      expect(liArgs.create.productId).toBe("product-1");
      expect(liArgs.create.quantity).toBe(2);
    });

    it("should update an existing order on re-sync (upsert behavior)", async () => {
      const updatedOrder = { id: "order-1", storeId: "store-1", orderNumber: "#1001" };
      prisma.order.upsert.mockResolvedValue(updatedOrder);
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.lineItem.upsert.mockResolvedValue({ id: "li-1" });

      const service = new OrderService(prisma);
      const input = sampleInput({ financialStatus: "refunded" });
      const result = await service.upsertFromShopify(input);

      expect(result).toEqual(updatedOrder);

      const upsertArgs = prisma.order.upsert.mock.calls[0][0];
      expect(upsertArgs.update.financialStatus).toBe("REFUNDED");
    });

    it("should write an outbox event within the same transaction", async () => {
      prisma.order.upsert.mockResolvedValue({ id: "order-1" });
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.lineItem.upsert.mockResolvedValue({});

      const service = new OrderService(prisma);
      await service.upsertFromShopify(sampleInput());

      expect(writeOutboxEvent).toHaveBeenCalledOnce();
      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(), // the tx object
        expect.objectContaining({
          storeId: "store-1",
          aggregateType: "Order",
          aggregateId: "order-1",
          eventType: "order.synced",
        })
      );
    });

    it("should set productId to null when SKU does not match any product", async () => {
      prisma.order.upsert.mockResolvedValue({ id: "order-1" });
      prisma.product.findFirst.mockResolvedValue(null); // no product found
      prisma.lineItem.upsert.mockResolvedValue({});

      const service = new OrderService(prisma);
      await service.upsertFromShopify(sampleInput());

      const liArgs = prisma.lineItem.upsert.mock.calls[0][0];
      expect(liArgs.create.productId).toBeNull();
    });

    it("should skip product lookup when line item has no SKU", async () => {
      prisma.order.upsert.mockResolvedValue({ id: "order-1" });
      prisma.lineItem.upsert.mockResolvedValue({});

      const service = new OrderService(prisma);
      const input = sampleInput({
        lineItems: [
          { shopifyLineItemId: "li-1", title: "Custom Item", quantity: 1, price: "10.00" },
        ],
      });
      await service.upsertFromShopify(input);

      expect(prisma.product.findFirst).not.toHaveBeenCalled();
      const liArgs = prisma.lineItem.upsert.mock.calls[0][0];
      expect(liArgs.create.productId).toBeNull();
    });

    it("should map unknown financial statuses to PENDING", async () => {
      prisma.order.upsert.mockResolvedValue({ id: "order-1" });
      prisma.lineItem.upsert.mockResolvedValue({});

      const service = new OrderService(prisma);
      await service.upsertFromShopify(sampleInput({ financialStatus: "unknown_status" }));

      const upsertArgs = prisma.order.upsert.mock.calls[0][0];
      expect(upsertArgs.create.financialStatus).toBe("PENDING");
    });
  });

  // ========================================================================
  // listByStore
  // ========================================================================
  describe("listByStore", () => {
    it("should return paginated orders scoped by storeId", async () => {
      const orders = [
        { id: "o-1", storeId: "store-1", lineItems: [] },
        { id: "o-2", storeId: "store-1", lineItems: [] },
      ];
      prisma.order.findMany.mockResolvedValue(orders);

      const service = new OrderService(prisma);
      const result = await service.listByStore("store-1", { limit: "20" });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            storeId: "store-1",
            deletedAt: null,
          }),
          include: { lineItems: true },
        })
      );
      expect(result.data).toEqual(orders);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("should pass fulfillmentStatus filter when provided", async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const service = new OrderService(prisma);
      await service.listByStore("store-1", {
        fulfillmentStatus: "unfulfilled",
      });

      const callArgs = prisma.order.findMany.mock.calls[0][0];
      expect(callArgs.where.fulfillmentStatus).toBe("UNFULFILLED");
    });

    it("should indicate hasMore when result count exceeds limit", async () => {
      // With limit=1, Prisma fetches take=2 (limit+1). If 2 come back, hasMore=true.
      const orders = [
        { id: "o-1", storeId: "store-1", lineItems: [] },
        { id: "o-2", storeId: "store-1", lineItems: [] },
      ];
      prisma.order.findMany.mockResolvedValue(orders);

      const service = new OrderService(prisma);
      const result = await service.listByStore("store-1", { limit: "1" });

      expect(result.pagination.hasMore).toBe(true);
      // data should be trimmed to the requested limit
      expect(result.data).toHaveLength(1);
    });
  });

  // ========================================================================
  // getById
  // ========================================================================
  describe("getById", () => {
    it("should return order with line items and shipments", async () => {
      const order = {
        id: "order-1",
        storeId: "store-1",
        lineItems: [{ id: "li-1" }],
        shipments: [{ id: "ship-1" }],
      };
      prisma.order.findFirst.mockResolvedValue(order);

      const service = new OrderService(prisma);
      const result = await service.getById("store-1", "order-1");

      expect(result).toEqual(order);
      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: "order-1", storeId: "store-1", deletedAt: null },
        include: { lineItems: true, shipments: true },
      });
    });

    it("should throw ORDER_NOT_FOUND when order does not exist", async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      const service = new OrderService(prisma);

      await expect(
        service.getById("store-1", "missing-order")
      ).rejects.toThrow(AppError);

      try {
        await service.getById("store-1", "missing-order");
      } catch (error) {
        expect((error as AppError).code).toBe(ErrorCode.ORDER_NOT_FOUND);
      }
    });
  });
});
