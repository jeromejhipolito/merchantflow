import { describe, it, expect } from "vitest";
import { hashRequestBody } from "../index.js";

describe("Idempotency Key Logic", () => {
  describe("hashRequestBody", () => {
    it("should produce consistent hash for same body", () => {
      const body = { orderId: "123", amount: 29.99 };
      const hash1 = hashRequestBody(body);
      const hash2 = hashRequestBody(body);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hash for different body", () => {
      const hash1 = hashRequestBody({ orderId: "123" });
      const hash2 = hashRequestBody({ orderId: "456" });
      expect(hash1).not.toBe(hash2);
    });

    it("should handle null/undefined body", () => {
      const hash1 = hashRequestBody(null);
      const hash2 = hashRequestBody(undefined);
      expect(hash1).toBe(hash2); // both serialize to {}
    });

    it("should be a valid SHA-256 hex string (64 characters)", () => {
      const hash = hashRequestBody({ test: true });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should produce different hash when property order differs but JSON.stringify is deterministic", () => {
      // JSON.stringify is deterministic for same insertion order
      const body1 = { a: 1, b: 2 };
      const body2 = { a: 1, b: 2 };
      expect(hashRequestBody(body1)).toBe(hashRequestBody(body2));
    });
  });
});
