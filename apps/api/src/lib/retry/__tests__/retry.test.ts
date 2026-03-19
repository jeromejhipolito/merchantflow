import { describe, it, expect, vi } from "vitest";
import { withRetry, calculateDelay, calculateNextRetryAt } from "../index.js";

describe("Retry with Exponential Backoff + Full Jitter", () => {
  describe("calculateDelay", () => {
    it("should cap delay at maxDelayMs", () => {
      // With base=1000 and attempt=20, exponential would be enormous
      // but cap should prevent that
      const delay = calculateDelay(20, 1000, 5000);
      expect(delay).toBeLessThanOrEqual(5000);
      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it("should return value within [0, min(cap, base * 2^attempt)]", () => {
      // Run many times to verify distribution stays in bounds
      for (let i = 0; i < 100; i++) {
        const delay = calculateDelay(3, 500, 30000);
        // base * 2^3 = 500 * 8 = 4000
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(4000);
      }
    });

    it("should increase upper bound exponentially per attempt", () => {
      // Collect max observed delays across many samples
      const maxByAttempt = [0, 1, 2, 3].map((attempt) => {
        let max = 0;
        for (let i = 0; i < 500; i++) {
          max = Math.max(max, calculateDelay(attempt, 1000, 60000));
        }
        return max;
      });
      // Each attempt's max should generally be higher than the previous
      // (not guaranteed per sample, but trend should hold)
      expect(maxByAttempt[2]!).toBeGreaterThan(maxByAttempt[0]!);
    });
  });

  describe("calculateNextRetryAt", () => {
    it("should return a Date in the future", () => {
      const now = Date.now();
      const retryAt = calculateNextRetryAt(1, 1000, 30000);
      expect(retryAt.getTime()).toBeGreaterThanOrEqual(now);
    });
  });

  describe("withRetry", () => {
    it("should return result on first success", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      const result = await withRetry(fn, { maxAttempts: 3 });
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable error and eventually succeed", async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500, message: "Internal" })
        .mockRejectedValueOnce({ status: 502, message: "Bad Gateway" })
        .mockResolvedValue("recovered");

      const result = await withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 1, // fast for tests
        maxDelayMs: 10,
      });

      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable error (4xx)", async () => {
      const fn = vi.fn().mockRejectedValue({ status: 400, message: "Bad Request" });

      await expect(
        withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
      ).rejects.toEqual({ status: 400, message: "Bad Request" });

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on 429 (rate limited)", async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: "Rate Limited" })
        .mockResolvedValue("ok");

      const result = await withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
      });

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should throw after exhausting all attempts", async () => {
      const fn = vi.fn().mockRejectedValue({ status: 500, message: "Down" });

      await expect(
        withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })
      ).rejects.toEqual({ status: 500, message: "Down" });

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should call onRetry callback before each retry", async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValue("ok");

      await withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 1,
        maxDelayMs: 5,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.anything());
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Number), expect.anything());
    });
  });
});
