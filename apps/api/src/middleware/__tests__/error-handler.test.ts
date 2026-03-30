import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerErrorHandler } from "../error-handler.js";
import { AppError, ErrorCode } from "../../lib/errors/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type ErrorHandler = (error: any, request: any, reply: any) => any;

function buildApp() {
  let handler: ErrorHandler | null = null;

  return {
    setErrorHandler: vi.fn((fn: ErrorHandler) => {
      handler = fn;
    }),
    getHandler(): ErrorHandler {
      if (!handler) throw new Error("No error handler registered");
      return handler;
    },
  } as any;
}

function buildRequest(url = "/api/orders") {
  return {
    url,
    method: "GET",
    log: {
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function buildReply() {
  const reply: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Error Handler Middleware", () => {
  let app: ReturnType<typeof buildApp>;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    registerErrorHandler(app);
    errorHandler = app.getHandler();
  });

  // ========================================================================
  // AppError mapping
  // ========================================================================
  describe("AppError handling", () => {
    it("should map VALIDATION_ERROR to 400", () => {
      const error = new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Invalid input",
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it("should map UNAUTHORIZED to 401", () => {
      const error = new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Not authenticated",
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it("should map NOT_FOUND to 404", () => {
      const error = new AppError({
        code: ErrorCode.NOT_FOUND,
        message: "Resource not found",
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it("should map CONFLICT to 409", () => {
      const error = new AppError({
        code: ErrorCode.CONFLICT,
        message: "Duplicate",
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(409);
    });

    it("should map INVALID_SHIPMENT_TRANSITION to 422", () => {
      const error = new AppError({
        code: ErrorCode.INVALID_SHIPMENT_TRANSITION,
        message: "Bad transition",
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(422);
    });

    it("should map RATE_LIMITED to 429", () => {
      const error = new AppError({
        code: ErrorCode.RATE_LIMITED,
        message: "Slow down",
        retryAfterSeconds: 60,
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(429);
      expect(reply.header).toHaveBeenCalledWith("Retry-After", "60");
    });

    it("should map INTERNAL_ERROR to 500", () => {
      const error = new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Something broke",
        isOperational: false,
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(500);
    });

    it("should include error code and message in response body", () => {
      const error = new AppError({
        code: ErrorCode.ORDER_NOT_FOUND,
        message: "Order not found: order-1",
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: ErrorCode.ORDER_NOT_FOUND,
          message: "Order not found: order-1",
        }),
      });
    });

    it("should include details when present on AppError", () => {
      const error = new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Bad input",
        details: { field: "email", reason: "invalid format" },
      });
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.send).toHaveBeenCalledWith({
        error: expect.objectContaining({
          details: { field: "email", reason: "invalid format" },
        }),
      });
    });
  });

  // ========================================================================
  // Production mode — hide stack traces
  // ========================================================================
  describe("production mode", () => {
    it("should hide stack trace in production for unknown errors", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const error = new Error("Unexpected crash");
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      const sentBody = reply.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe(
        "An internal error occurred. Please try again later."
      );
      expect(sentBody.error.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it("should include stack trace in non-production for unknown errors", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Unexpected crash");
      error.stack = "Error: Unexpected crash\n    at test.ts:1:1";
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      const sentBody = reply.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe("Unexpected crash");
      expect(sentBody.error.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ========================================================================
  // Non-AppError (unknown errors)
  // ========================================================================
  describe("non-AppError handling", () => {
    it("should handle unknown errors as 500 INTERNAL_ERROR", () => {
      const error = new Error("Something went wrong");
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      const sentBody = reply.send.mock.calls[0][0];
      expect(sentBody.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  // ========================================================================
  // Fastify validation errors
  // ========================================================================
  describe("Fastify validation errors", () => {
    it("should handle Fastify validation errors as 400", () => {
      const error = {
        validation: [
          { keyword: "required", dataPath: ".email", message: "is required", params: {} },
        ],
        message: "body must have required property 'email'",
        name: "Error",
      };
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      const sentBody = reply.send.mock.calls[0][0];
      expect(sentBody.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(sentBody.error.details.errors).toHaveLength(1);
    });
  });

  // ========================================================================
  // Prisma errors
  // ========================================================================
  describe("Prisma errors", () => {
    it("should handle Prisma P2002 (unique constraint) as 409", () => {
      const error = {
        code: "P2002",
        meta: { target: ["email"] },
        message: "Unique constraint failed",
        name: "PrismaClientKnownRequestError",
      };
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(409);
      const sentBody = reply.send.mock.calls[0][0];
      expect(sentBody.error.code).toBe(ErrorCode.CONFLICT);
    });

    it("should handle Prisma P2025 (record not found) as 404", () => {
      const error = {
        code: "P2025",
        message: "Record to update not found",
        name: "PrismaClientKnownRequestError",
      };
      const reply = buildReply();

      errorHandler(error, buildRequest(), reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      const sentBody = reply.send.mock.calls[0][0];
      expect(sentBody.error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });
});
