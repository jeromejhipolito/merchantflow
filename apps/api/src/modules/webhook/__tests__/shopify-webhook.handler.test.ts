import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleShopifyWebhook,
  type ShopifyWebhookDeps,
} from "../shopify-webhook.handler.js";
import { AppError, ErrorCode } from "../../../lib/errors/index.js";

vi.mock("../../../lib/hmac/index.js", () => ({
  verifyShopifyWebhookHmac: vi.fn(),
}));

import { verifyShopifyWebhookHmac } from "../../../lib/hmac/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildDeps(): ShopifyWebhookDeps {
  return {
    prisma: {
      store: { findUnique: vi.fn().mockResolvedValue(null) },
      shopifyWebhookLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    } as any,
    queues: {
      "order-sync": { add: vi.fn().mockResolvedValue({}) },
      "product-sync": { add: vi.fn().mockResolvedValue({}) },
      "store-lifecycle": { add: vi.fn().mockResolvedValue({}) },
    } as any,
    shopifyApiSecret: "test-secret",
  };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {
      "x-shopify-hmac-sha256": "validhmac",
      "x-shopify-webhook-id": "wh-123",
      "x-shopify-topic": "orders/create",
      "x-shopify-shop-domain": "my-shop.myshopify.com",
      ...(overrides.headers as Record<string, string> | undefined),
    },
    rawBody: Buffer.from(JSON.stringify({ id: 123 })),
    url: "/webhooks/shopify",
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  } as any;
}

function buildReply() {
  const reply: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("handleShopifyWebhook", () => {
  let deps: ShopifyWebhookDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildDeps();
  });

  // ========================================================================
  // Header validation
  // ========================================================================
  describe("header validation", () => {
    it("should reject request missing X-Shopify-Hmac-Sha256 header", async () => {
      const request = buildRequest({
        headers: {
          "x-shopify-webhook-id": "wh-123",
          "x-shopify-topic": "orders/create",
          "x-shopify-shop-domain": "my-shop.myshopify.com",
        },
      });

      await expect(
        handleShopifyWebhook(request, buildReply(), deps)
      ).rejects.toThrow(AppError);
      await expect(
        handleShopifyWebhook(request, buildReply(), deps)
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it("should reject request missing X-Shopify-Webhook-Id header", async () => {
      const request = buildRequest({
        headers: {
          "x-shopify-hmac-sha256": "validhmac",
          "x-shopify-topic": "orders/create",
          "x-shopify-shop-domain": "my-shop.myshopify.com",
        },
      });

      await expect(
        handleShopifyWebhook(request, buildReply(), deps)
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it("should reject request missing X-Shopify-Topic header", async () => {
      const request = buildRequest({
        headers: {
          "x-shopify-hmac-sha256": "validhmac",
          "x-shopify-webhook-id": "wh-123",
          "x-shopify-shop-domain": "my-shop.myshopify.com",
        },
      });

      await expect(
        handleShopifyWebhook(request, buildReply(), deps)
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it("should reject request missing X-Shopify-Shop-Domain header", async () => {
      const request = buildRequest({
        headers: {
          "x-shopify-hmac-sha256": "validhmac",
          "x-shopify-webhook-id": "wh-123",
          "x-shopify-topic": "orders/create",
        },
      });

      await expect(
        handleShopifyWebhook(request, buildReply(), deps)
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });
  });

  // ========================================================================
  // HMAC validation
  // ========================================================================
  describe("HMAC validation", () => {
    it("should reject invalid HMAC signature with INVALID_HMAC error", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(false);

      const request = buildRequest();
      const reply = buildReply();

      await expect(
        handleShopifyWebhook(request, reply, deps)
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_HMAC });
    });

    it("should accept valid HMAC and create webhook log", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);

      const request = buildRequest();
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect(deps.prisma.shopifyWebhookLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopifyWebhookId: "wh-123",
          topic: "orders/create",
          shopifyDomain: "my-shop.myshopify.com",
          status: "RECEIVED",
        }),
      });
    });
  });

  // ========================================================================
  // Deduplication
  // ========================================================================
  describe("deduplication", () => {
    it("should return 200 without re-processing duplicate webhook IDs", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);
      (deps.prisma.shopifyWebhookLog.findUnique as any).mockResolvedValue({
        shopifyWebhookId: "wh-123",
        status: "RECEIVED",
      });

      const request = buildRequest();
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: "duplicate" })
      );
      // Should NOT create a new log or dispatch to queue
      expect(deps.prisma.shopifyWebhookLog.create).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Queue dispatch
  // ========================================================================
  describe("queue dispatch", () => {
    it("should dispatch orders/create to order-sync queue", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);

      const request = buildRequest();
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect((deps.queues as any)["order-sync"].add).toHaveBeenCalledWith(
        "orders/create",
        expect.objectContaining({
          webhookId: "wh-123",
          topic: "orders/create",
          shopDomain: "my-shop.myshopify.com",
        }),
        expect.objectContaining({
          jobId: "wh-123",
          attempts: 5,
        })
      );
    });

    it("should dispatch products/update to product-sync queue", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);

      const request = buildRequest({
        headers: {
          "x-shopify-hmac-sha256": "validhmac",
          "x-shopify-webhook-id": "wh-456",
          "x-shopify-topic": "products/update",
          "x-shopify-shop-domain": "my-shop.myshopify.com",
        },
      });
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect((deps.queues as any)["product-sync"].add).toHaveBeenCalledWith(
        "products/update",
        expect.objectContaining({ topic: "products/update" }),
        expect.any(Object)
      );
    });

    it("should dispatch app/uninstalled to store-lifecycle queue", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);

      const request = buildRequest({
        headers: {
          "x-shopify-hmac-sha256": "validhmac",
          "x-shopify-webhook-id": "wh-789",
          "x-shopify-topic": "app/uninstalled",
          "x-shopify-shop-domain": "my-shop.myshopify.com",
        },
      });
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect((deps.queues as any)["store-lifecycle"].add).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Unrecognized topics
  // ========================================================================
  describe("unrecognized topics", () => {
    it("should return 200 with 'ignored' for unrecognized topics", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);

      const request = buildRequest({
        headers: {
          "x-shopify-hmac-sha256": "validhmac",
          "x-shopify-webhook-id": "wh-999",
          "x-shopify-topic": "carts/create",
          "x-shopify-shop-domain": "my-shop.myshopify.com",
        },
      });
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ignored",
          reason: "unrecognized topic",
        })
      );
    });
  });

  // ========================================================================
  // Fast ack
  // ========================================================================
  describe("fast acknowledgement", () => {
    it("should always return 200 for valid accepted webhooks", async () => {
      (verifyShopifyWebhookHmac as any).mockReturnValue(true);

      const request = buildRequest();
      const reply = buildReply();

      await handleShopifyWebhook(request, reply, deps);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted", webhookId: "wh-123" })
      );
    });
  });
});
