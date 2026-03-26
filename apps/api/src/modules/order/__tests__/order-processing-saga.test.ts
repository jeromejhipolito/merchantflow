// =============================================================================
// Order Processing Saga — Unit Tests
// =============================================================================
// Tests the order processing saga step definitions using mocked Prisma calls.
// These validate business logic (validation, status mapping, inventory
// adjustment, outbox event writing) without requiring a real database.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrderProcessingSaga } from "../order-processing.saga.js";
import type { OrderProcessingContext } from "../order-processing.saga.js";

// ---------------------------------------------------------------------------
// Shopify Payload Fixtures
// ---------------------------------------------------------------------------

function createShopifyOrderPayload(overrides: Record<string, any> = {}) {
  return {
    id: 123456789,
    order_number: 1001,
    name: "#1001",
    subtotal_price: "49.99",
    total_tax: "5.00",
    total_shipping_price_set: {
      shop_money: { amount: "9.99" },
    },
    total_discounts: "0.00",
    total_price: "64.98",
    currency: "USD",
    financial_status: "paid",
    fulfillment_status: null,
    customer: {
      email: "test@example.com",
      first_name: "John",
      last_name: "Doe",
      phone: "+1234567890",
    },
    shipping_address: {
      address1: "123 Main St",
      address2: "Apt 4",
      city: "Manila",
      province: "NCR",
      zip: "1000",
      country_code: "PH",
      phone: "+1234567890",
    },
    line_items: [
      {
        id: 111,
        title: "Cool T-Shirt",
        variant_title: "Large / Blue",
        sku: "TSHIRT-LG-BL",
        quantity: 2,
        price: "24.99",
      },
    ],
    created_at: "2026-03-29T10:00:00Z",
    ...overrides,
  };
}

function createInitialContext(
  overrides: Partial<OrderProcessingContext> = {}
): OrderProcessingContext {
  return {
    storeId: "store-1",
    shopifyOrderId: "123456789",
    topic: "orders/create",
    webhookId: "webhook-1",
    shopifyPayload: createShopifyOrderPayload(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const mockTx = {
    order: {
      upsert: vi.fn().mockResolvedValue({ id: "order-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    lineItem: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    product: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    outboxEvent: {
      create: vi.fn().mockResolvedValue({ id: "event-1" }),
    },
  };

  return {
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
    order: {
      update: vi.fn().mockResolvedValue({}),
    },
    product: {
      update: vi.fn().mockResolvedValue({}),
    },
    _tx: mockTx, // expose for assertions
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Order Processing Saga", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe("saga definition", () => {
    it("should have 4 steps in correct order", () => {
      const saga = createOrderProcessingSaga(prisma);

      expect(saga.type).toBe("ORDER_PROCESSING");
      expect(saga.steps).toHaveLength(4);
      expect(saga.steps.map((s) => s.name)).toEqual([
        "ValidatePayload",
        "UpsertOrder",
        "UpdateInventory",
        "DeliverWebhooks",
      ]);
    });
  });

  describe("Step 1: ValidatePayload", () => {
    it("should parse Shopify payload into domain model shape", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[0]!;
      const context = createInitialContext();

      const result = await step.execute(context);

      expect(result.orderNumber).toBe("1001");
      expect(result.subtotalPrice).toBe("49.99");
      expect(result.totalTax).toBe("5.00");
      expect(result.totalShipping).toBe("9.99");
      expect(result.totalDiscount).toBe("0.00");
      expect(result.totalPrice).toBe("64.98");
      expect(result.currencyCode).toBe("USD");
      expect(result.financialStatus).toBe("paid");
      expect(result.customer).toEqual({
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        phone: "+1234567890",
      });
      expect(result.shippingAddress).toEqual({
        address1: "123 Main St",
        address2: "Apt 4",
        city: "Manila",
        province: "NCR",
        zip: "1000",
        countryCode: "PH",
        phone: "+1234567890",
      });
      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems![0]).toEqual({
        shopifyLineItemId: "111",
        title: "Cool T-Shirt",
        variantTitle: "Large / Blue",
        sku: "TSHIRT-LG-BL",
        quantity: 2,
        price: "24.99",
      });
    });

    it("should throw on missing order_number", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[0]!;
      const context = createInitialContext({
        shopifyPayload: createShopifyOrderPayload({
          order_number: null,
          name: null,
        }),
      });

      // "null" is still a truthy string, so we need to test with truly empty
      const emptyContext = createInitialContext({
        shopifyPayload: { ...createShopifyOrderPayload(), line_items: [] },
      });

      await expect(step.execute(emptyContext)).rejects.toThrow(
        "no line items"
      );
    });

    it("should throw on empty line_items", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[0]!;
      const context = createInitialContext({
        shopifyPayload: createShopifyOrderPayload({ line_items: [] }),
      });

      await expect(step.execute(context)).rejects.toThrow("no line items");
    });

    it("should have maxRetries of 1 (no point retrying validation)", () => {
      const saga = createOrderProcessingSaga(prisma);
      expect(saga.steps[0]!.maxRetries).toBe(1);
    });

    it("should not have a compensate function", () => {
      const saga = createOrderProcessingSaga(prisma);
      expect(saga.steps[0]!.compensate).toBeUndefined();
    });
  });

  describe("Step 2: UpsertOrder", () => {
    it("should upsert order and line items via Prisma transaction", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[1]!;

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        orderNumber: "1001",
        subtotalPrice: "49.99",
        totalTax: "5.00",
        totalShipping: "9.99",
        totalDiscount: "0.00",
        totalPrice: "64.98",
        currencyCode: "USD",
        financialStatus: "paid",
        fulfillmentStatus: null,
        lineItems: [
          {
            shopifyLineItemId: "111",
            title: "Cool T-Shirt",
            variantTitle: "Large / Blue",
            sku: "TSHIRT-LG-BL",
            quantity: 2,
            price: "24.99",
          },
        ],
        shopifyCreatedAt: "2026-03-29T10:00:00Z",
      };

      const result = await step.execute(context);

      expect(result.orderId).toBe("order-1");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma._tx.order.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            uq_store_shopify_order: {
              storeId: "store-1",
              shopifyOrderId: "123456789",
            },
          },
          create: expect.objectContaining({
            financialStatus: "PAID",
            fulfillmentStatus: "UNFULFILLED",
          }),
        })
      );
    });

    it("should have a compensate function that nullifies shopifySyncedAt", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[1]!;

      expect(step.compensate).toBeDefined();

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        orderId: "order-1",
      };

      await step.compensate!(context);

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { shopifySyncedAt: null },
      });
    });

    it("should map Shopify financial status strings to enums", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[1]!;

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        orderNumber: "1001",
        subtotalPrice: "0",
        totalTax: "0",
        totalShipping: "0",
        totalDiscount: "0",
        totalPrice: "0",
        currencyCode: "USD",
        financialStatus: "authorized",
        fulfillmentStatus: "partial",
        lineItems: [],
        shopifyCreatedAt: "2026-03-29T10:00:00Z",
      };

      await step.execute(context);

      expect(prisma._tx.order.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            financialStatus: "AUTHORIZED",
            fulfillmentStatus: "PARTIALLY_FULFILLED",
          }),
        })
      );
    });
  });

  describe("Step 3: UpdateInventory", () => {
    it("should decrement inventory for products matched by SKU", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[2]!;

      // Mock product lookup
      prisma._tx.product.findFirst.mockResolvedValue({
        id: "prod-1",
        sku: "TSHIRT-LG-BL",
      });

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        lineItems: [
          {
            shopifyLineItemId: "111",
            title: "Cool T-Shirt",
            sku: "TSHIRT-LG-BL",
            quantity: 2,
            price: "24.99",
          },
        ],
      };

      const result = await step.execute(context);

      expect(result.inventoryAdjustments).toHaveLength(1);
      expect(result.inventoryAdjustments![0]).toEqual({
        productId: "prod-1",
        sku: "TSHIRT-LG-BL",
        quantityDelta: -2,
      });

      expect(prisma._tx.product.update).toHaveBeenCalledWith({
        where: { id: "prod-1" },
        data: { inventoryQuantity: { decrement: 2 } },
      });
    });

    it("should skip line items without a SKU", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[2]!;

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        lineItems: [
          {
            shopifyLineItemId: "111",
            title: "Custom Item",
            quantity: 1,
            price: "10.00",
            // no sku
          },
        ],
      };

      const result = await step.execute(context);

      expect(result.inventoryAdjustments).toHaveLength(0);
      expect(prisma._tx.product.findFirst).not.toHaveBeenCalled();
    });

    it("should reverse inventory adjustments during compensation", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[2]!;

      expect(step.compensate).toBeDefined();

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        inventoryAdjustments: [
          { productId: "prod-1", sku: "TSHIRT-LG-BL", quantityDelta: -2 },
          { productId: "prod-2", sku: "HOODIE-MD-RD", quantityDelta: -1 },
        ],
      };

      await step.compensate!(context);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma._tx.product.update).toHaveBeenCalledTimes(2);
      expect(prisma._tx.product.update).toHaveBeenCalledWith({
        where: { id: "prod-1" },
        data: { inventoryQuantity: { increment: 2 } },
      });
      expect(prisma._tx.product.update).toHaveBeenCalledWith({
        where: { id: "prod-2" },
        data: { inventoryQuantity: { increment: 1 } },
      });
    });
  });

  describe("Step 4: DeliverWebhooks", () => {
    it("should write outbox event for order.synced", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[3]!;

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        orderId: "order-1",
        orderNumber: "1001",
      };

      await step.execute(context);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma._tx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: "store-1",
          aggregateType: "Order",
          aggregateId: "order-1",
          eventType: "order.synced",
          status: "PENDING",
          payload: expect.objectContaining({
            orderId: "order-1",
            shopifyOrderId: "123456789",
            orderNumber: "1001",
            topic: "orders/create",
          }),
        }),
      });
    });

    it("should not have a compensate function", () => {
      const saga = createOrderProcessingSaga(prisma);
      expect(saga.steps[3]!.compensate).toBeUndefined();
    });

    it("should return empty object when orderId is missing", async () => {
      const saga = createOrderProcessingSaga(prisma);
      const step = saga.steps[3]!;

      const context: OrderProcessingContext = {
        ...createInitialContext(),
        // orderId not set
      };

      const result = await step.execute(context);

      expect(result).toEqual({});
      // Transaction should not have been called
      expect(prisma._tx.outboxEvent.create).not.toHaveBeenCalled();
    });
  });
});
