import { describe, it, expect } from "vitest";
import { AppError, ErrorCode } from "../index.js";

describe("Error Handling", () => {
  describe("AppError", () => {
    it("should create error with code and message", () => {
      const error = new AppError({
        code: ErrorCode.ORDER_NOT_FOUND,
        message: "Order abc not found",
      });
      expect(error.code).toBe(ErrorCode.ORDER_NOT_FOUND);
      expect(error.message).toBe("Order abc not found");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it("should include HTTP status code based on error code", () => {
      const notFound = new AppError({ code: ErrorCode.ORDER_NOT_FOUND, message: "not found" });
      expect(notFound.statusCode).toBe(404);

      const validation = new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "invalid" });
      expect(validation.statusCode).toBe(400);

      const auth = new AppError({ code: ErrorCode.UNAUTHORIZED, message: "no token" });
      expect(auth.statusCode).toBe(401);
    });

    it("should classify operational vs programmer errors", () => {
      const operational = new AppError({
        code: ErrorCode.ORDER_NOT_FOUND,
        message: "not found",
        isOperational: true,
      });
      expect(operational.isOperational).toBe(true);

      const programmer = new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: "null ref",
        isOperational: false,
      });
      expect(programmer.isOperational).toBe(false);
    });

    it("should include retry-after for rate limit errors", () => {
      const error = new AppError({
        code: ErrorCode.RATE_LIMITED,
        message: "too many requests",
        retryAfterSeconds: 30,
      });
      expect(error.retryAfterSeconds).toBe(30);
    });
  });
});
