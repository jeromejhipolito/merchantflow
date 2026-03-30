import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookService, type WebhookEvent } from "../webhook.service.js";

vi.mock("../../../lib/hmac/index.js", () => ({
  signWebhookPayload: vi.fn().mockReturnValue("sha256=fakesig"),
}));

vi.mock("../../../lib/retry/index.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

import { signWebhookPayload } from "../../../lib/hmac/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildPrisma() {
  return {
    webhookEndpoint: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any[]) => ops),
  } as any;
}

let prisma: ReturnType<typeof buildPrisma>;

function sampleEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    eventType: "order.synced",
    payload: { orderId: "order-1" },
    storeId: "store-1",
    ...overrides,
  };
}

function activeEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "ep-1",
    storeId: "store-1",
    url: "https://hooks.example.com/order",
    secret: "whsec_test123",
    events: ["order.synced"],
    isActive: true,
    failureCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("WebhookService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma = buildPrisma();
    // Mock global fetch
    vi.stubGlobal("fetch", vi.fn());
  });

  // ========================================================================
  // deliverEvent
  // ========================================================================
  describe("deliverEvent", () => {
    it("should send POST with HMAC signature to matching endpoints", async () => {
      const endpoint = activeEndpoint();
      prisma.webhookEndpoint.findMany.mockResolvedValue([endpoint]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" });

      (fetch as any).mockResolvedValue({ ok: true, status: 200 });

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent());

      expect(signWebhookPayload).toHaveBeenCalledWith(
        JSON.stringify({ orderId: "order-1" }),
        "whsec_test123"
      );

      expect(fetch).toHaveBeenCalledWith(
        "https://hooks.example.com/order",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-MerchantFlow-Signature": "sha256=fakesig",
            "X-MerchantFlow-Event": "order.synced",
          }),
        })
      );
    });

    it("should create a webhook delivery record before sending", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([activeEndpoint()]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" });
      (fetch as any).mockResolvedValue({ ok: true, status: 200 });

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent());

      expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          endpointId: "ep-1",
          eventType: "order.synced",
          status: "PENDING",
        }),
      });
    });

    it("should increment failure count on HTTP error", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([
        activeEndpoint({ failureCount: 2 }),
      ]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" });

      // fetch throws (simulates withRetry exhausting attempts)
      (fetch as any).mockRejectedValue(new Error("Connection refused"));

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent());

      // The $transaction for failure should be called
      expect(prisma.$transaction).toHaveBeenCalled();

      const failureTxOps = prisma.$transaction.mock.calls[0][0];
      // Second operation is the endpoint update
      // Since $transaction receives an array of Prisma operations, we verify
      // the update was called on the endpoint
      expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ep-1" },
          data: expect.objectContaining({
            failureCount: 3, // 2 + 1
          }),
        })
      );
    });

    it("should auto-disable endpoint after max consecutive failures (10)", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([
        activeEndpoint({ failureCount: 9 }), // one more failure = 10 = disable
      ]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" });
      (fetch as any).mockRejectedValue(new Error("Timeout"));

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent());

      expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ep-1" },
          data: expect.objectContaining({
            failureCount: 10,
            isActive: false,
            disabledReason: expect.stringContaining("10 consecutive failures"),
          }),
        })
      );
    });

    it("should skip inactive endpoints (only queries active ones)", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([]); // no active endpoints

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent());

      // fetch should never be called
      expect(fetch).not.toHaveBeenCalled();
      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it("should query only active endpoints matching the event type", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([]);

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent({ eventType: "shipment.shipped" }));

      expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
        where: {
          storeId: "store-1",
          isActive: true,
          events: { has: "shipment.shipped" },
        },
      });
    });

    it("should reset failure count to 0 on successful delivery", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([
        activeEndpoint({ failureCount: 5 }),
      ]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" });
      (fetch as any).mockResolvedValue({ ok: true, status: 200 });

      const service = new WebhookService(prisma);
      await service.deliverEvent(sampleEvent());

      expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureCount: 0,
          }),
        })
      );
    });

    it("should not throw if individual endpoint delivery fails", async () => {
      prisma.webhookEndpoint.findMany.mockResolvedValue([
        activeEndpoint({ id: "ep-1" }),
        activeEndpoint({ id: "ep-2", url: "https://other.example.com" }),
      ]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: "del-1" });

      // First endpoint fails, second succeeds
      (fetch as any)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const service = new WebhookService(prisma);
      // Should not throw — uses Promise.allSettled
      await expect(service.deliverEvent(sampleEvent())).resolves.toBeUndefined();
    });
  });
});
