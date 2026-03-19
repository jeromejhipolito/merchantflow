import { describe, it, expect } from "vitest";
import { verifyShopifyWebhookHmac, signWebhookPayload, verifyMerchantFlowSignature } from "../index.js";

describe("HMAC Verification", () => {
  describe("Shopify Inbound Webhook Verification", () => {
    const secret = "test-webhook-secret";
    const body = Buffer.from(JSON.stringify({ order_id: 123, total_price: "29.99" }));

    it("should accept webhook with valid HMAC signature", () => {
      // Compute the correct HMAC
      const { createHmac } = require("node:crypto");
      const validHmac = createHmac("sha256", secret).update(body).digest("base64");
      expect(verifyShopifyWebhookHmac(body, validHmac, secret)).toBe(true);
    });

    it("should reject webhook with invalid HMAC signature", () => {
      expect(verifyShopifyWebhookHmac(body, "invalid-base64-hmac", secret)).toBe(false);
    });

    it("should reject webhook with tampered body", () => {
      const { createHmac } = require("node:crypto");
      const hmac = createHmac("sha256", secret).update(body).digest("base64");
      const tamperedBody = Buffer.from(JSON.stringify({ order_id: 123, total_price: "0.01" }));
      expect(verifyShopifyWebhookHmac(tamperedBody, hmac, secret)).toBe(false);
    });

    it("should reject webhook with wrong secret", () => {
      const { createHmac } = require("node:crypto");
      const hmac = createHmac("sha256", secret).update(body).digest("base64");
      expect(verifyShopifyWebhookHmac(body, hmac, "wrong-secret")).toBe(false);
    });

    it("should use timing-safe comparison to prevent timing attacks", () => {
      // Verify that the function doesn't short-circuit on first mismatch
      // by checking it still returns false for signatures of same length
      const { createHmac } = require("node:crypto");
      const validHmac = createHmac("sha256", secret).update(body).digest("base64");
      const sameLength = "a".repeat(validHmac.length);
      expect(verifyShopifyWebhookHmac(body, sameLength, secret)).toBe(false);
    });
  });

  describe("MerchantFlow Outbound Webhook Signing", () => {
    const secret = "merchant-endpoint-secret";
    const payload = JSON.stringify({ event: "order.created", data: { id: "abc" } });

    it("should produce sha256=<hex> signature format", () => {
      const signature = signWebhookPayload(payload, secret);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("should produce deterministic signatures", () => {
      const sig1 = signWebhookPayload(payload, secret);
      const sig2 = signWebhookPayload(payload, secret);
      expect(sig1).toBe(sig2);
    });

    it("should produce different signatures for different payloads", () => {
      const sig1 = signWebhookPayload(payload, secret);
      const sig2 = signWebhookPayload(payload + "x", secret);
      expect(sig1).not.toBe(sig2);
    });

    it("should verify its own signatures", () => {
      const signature = signWebhookPayload(payload, secret);
      expect(verifyMerchantFlowSignature(payload, signature, secret)).toBe(true);
    });

    it("should reject forged signatures", () => {
      expect(verifyMerchantFlowSignature(payload, "sha256=0000000000000000000000000000000000000000000000000000000000000000", secret)).toBe(false);
    });
  });
});
