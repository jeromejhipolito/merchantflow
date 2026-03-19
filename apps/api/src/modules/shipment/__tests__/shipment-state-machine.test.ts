import { describe, it, expect } from "vitest";
import { assertValidTransition, VALID_TRANSITIONS } from "../shipment.service.js";
import { AppError, ErrorCode } from "../../../lib/errors/index.js";

// Use string literals matching the Prisma ShipmentStatus enum values
type Status = "PENDING" | "LABEL_GENERATING" | "LABEL_READY" | "LABEL_FAILED" | "SHIPPED" | "IN_TRANSIT" | "DELIVERED" | "FAILED" | "RETURNED";

describe("Shipment State Machine", () => {
  describe("Happy Path: Full Lifecycle", () => {
    const happyPath: [Status, Status][] = [
      ["PENDING", "LABEL_GENERATING"],
      ["LABEL_GENERATING", "LABEL_READY"],
      ["LABEL_READY", "SHIPPED"],
      ["SHIPPED", "IN_TRANSIT"],
      ["IN_TRANSIT", "DELIVERED"],
    ];

    it.each(happyPath)(
      "should allow transition from %s to %s",
      (from, to) => {
        expect(() => assertValidTransition(from as any, to as any)).not.toThrow();
      }
    );
  });

  describe("Valid Transitions", () => {
    it("should allow LABEL_GENERATING -> LABEL_FAILED", () => {
      expect(() => assertValidTransition("LABEL_GENERATING" as any, "LABEL_FAILED" as any)).not.toThrow();
    });

    it("should allow SHIPPED -> FAILED", () => {
      expect(() => assertValidTransition("SHIPPED" as any, "FAILED" as any)).not.toThrow();
    });

    it("should allow SHIPPED -> RETURNED", () => {
      expect(() => assertValidTransition("SHIPPED" as any, "RETURNED" as any)).not.toThrow();
    });

    it("should allow IN_TRANSIT -> FAILED", () => {
      expect(() => assertValidTransition("IN_TRANSIT" as any, "FAILED" as any)).not.toThrow();
    });

    it("should allow IN_TRANSIT -> RETURNED", () => {
      expect(() => assertValidTransition("IN_TRANSIT" as any, "RETURNED" as any)).not.toThrow();
    });
  });

  describe("Label Failed Retry Path", () => {
    it("should allow LABEL_FAILED -> LABEL_GENERATING (retry label generation)", () => {
      expect(() => assertValidTransition("LABEL_FAILED" as any, "LABEL_GENERATING" as any)).not.toThrow();
    });

    it("should allow LABEL_FAILED -> PENDING (full reset)", () => {
      expect(() => assertValidTransition("LABEL_FAILED" as any, "PENDING" as any)).not.toThrow();
    });

    it("should allow full retry cycle: LABEL_FAILED -> LABEL_GENERATING -> LABEL_READY", () => {
      expect(() => assertValidTransition("LABEL_FAILED" as any, "LABEL_GENERATING" as any)).not.toThrow();
      expect(() => assertValidTransition("LABEL_GENERATING" as any, "LABEL_READY" as any)).not.toThrow();
    });
  });

  describe("Invalid Transitions", () => {
    const invalidTransitions: [Status, Status][] = [
      ["DELIVERED", "PENDING"],
      ["DELIVERED", "SHIPPED"],
      ["DELIVERED", "IN_TRANSIT"],
      ["FAILED", "PENDING"],
      ["FAILED", "SHIPPED"],
      ["RETURNED", "PENDING"],
      ["RETURNED", "IN_TRANSIT"],
      ["PENDING", "SHIPPED"],
      ["PENDING", "DELIVERED"],
      ["LABEL_READY", "PENDING"],
      ["LABEL_READY", "DELIVERED"],
      ["SHIPPED", "PENDING"],
      ["SHIPPED", "LABEL_READY"],
      ["IN_TRANSIT", "PENDING"],
      ["IN_TRANSIT", "SHIPPED"],
    ];

    it.each(invalidTransitions)(
      "should reject transition from %s to %s",
      (from, to) => {
        expect(() => assertValidTransition(from as any, to as any)).toThrow(AppError);
      }
    );

    it("should throw INVALID_SHIPMENT_TRANSITION error code", () => {
      try {
        assertValidTransition("DELIVERED" as any, "PENDING" as any);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.INVALID_SHIPMENT_TRANSITION);
        expect((error as AppError).statusCode).toBe(422);
      }
    });

    it("should include current status and allowed transitions in error details", () => {
      try {
        assertValidTransition("DELIVERED" as any, "PENDING" as any);
        expect.fail("Should have thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.details).toBeDefined();
        expect(appError.details!.currentStatus).toBe("DELIVERED");
        expect(appError.details!.requestedStatus).toBe("PENDING");
        expect(appError.details!.allowed).toEqual([]);
      }
    });
  });

  describe("Terminal States", () => {
    const terminalStates: Status[] = ["DELIVERED", "FAILED", "RETURNED"];

    it.each(terminalStates)(
      "%s should have no valid outgoing transitions",
      (status) => {
        expect(VALID_TRANSITIONS[status as any]).toEqual([]);
      }
    );
  });

  describe("Coverage of All States", () => {
    const allStates: Status[] = [
      "PENDING",
      "LABEL_GENERATING",
      "LABEL_READY",
      "LABEL_FAILED",
      "SHIPPED",
      "IN_TRANSIT",
      "DELIVERED",
      "FAILED",
      "RETURNED",
    ];

    it("should have transition rules defined for every state", () => {
      for (const state of allStates) {
        expect(VALID_TRANSITIONS).toHaveProperty(state);
        expect(Array.isArray(VALID_TRANSITIONS[state as any])).toBe(true);
      }
    });
  });
});
