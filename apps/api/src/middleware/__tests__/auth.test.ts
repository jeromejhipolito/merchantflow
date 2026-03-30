import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerAuthMiddleware } from "../auth.js";
import { AppError, ErrorCode } from "../../lib/errors/index.js";

// ---------------------------------------------------------------------------
// Helpers — simulate Fastify app + request/reply lifecycle
// ---------------------------------------------------------------------------
type PreHandlerHook = (request: any, reply: any) => Promise<void>;

function buildApp() {
  let hook: PreHandlerHook | null = null;

  return {
    decorateRequest: vi.fn(),
    addHook: vi.fn((_name: string, fn: PreHandlerHook) => {
      hook = fn;
    }),
    getHook(): PreHandlerHook {
      if (!hook) throw new Error("No hook registered");
      return hook;
    },
  } as any;
}

function buildPrisma() {
  return {
    store: {
      findUnique: vi.fn(),
    },
  } as any;
}

function buildRequest(url: string, authorization?: string) {
  return {
    url,
    headers: {
      ...(authorization !== undefined ? { authorization } : {}),
    },
    storeId: "",
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Auth Middleware", () => {
  let app: ReturnType<typeof buildApp>;
  let prisma: ReturnType<typeof buildPrisma>;
  let preHandler: PreHandlerHook;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    prisma = buildPrisma();
    registerAuthMiddleware(app, prisma);
    preHandler = app.getHook();
  });

  // ========================================================================
  // Public routes
  // ========================================================================
  describe("public routes", () => {
    it("should allow /health without authentication", async () => {
      const request = buildRequest("/health");
      await expect(preHandler(request, {})).resolves.toBeUndefined();
    });

    it("should allow /health/ready without authentication", async () => {
      const request = buildRequest("/health/ready");
      await expect(preHandler(request, {})).resolves.toBeUndefined();
    });

    it("should allow /webhooks/shopify without authentication", async () => {
      const request = buildRequest("/webhooks/shopify");
      await expect(preHandler(request, {})).resolves.toBeUndefined();
    });

    it("should allow /auth/shopify without authentication", async () => {
      const request = buildRequest("/auth/shopify");
      await expect(preHandler(request, {})).resolves.toBeUndefined();
    });

    it("should allow /auth/shopify/callback without authentication", async () => {
      const request = buildRequest("/auth/shopify/callback?code=abc");
      await expect(preHandler(request, {})).resolves.toBeUndefined();
    });
  });

  // ========================================================================
  // Missing/invalid auth header
  // ========================================================================
  describe("missing or invalid Authorization header", () => {
    it("should reject requests without Authorization header", async () => {
      const request = buildRequest("/api/orders");

      await expect(preHandler(request, {})).rejects.toThrow(AppError);
      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });

    it("should reject requests with non-Bearer authorization", async () => {
      const request = buildRequest("/api/orders", "Basic dXNlcjpwYXNz");

      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });

    it("should reject requests with empty Bearer token", async () => {
      const request = buildRequest("/api/orders", "Bearer ");

      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });
  });

  // ========================================================================
  // Invalid / unknown API keys
  // ========================================================================
  describe("invalid or unknown API keys", () => {
    it("should reject unknown API keys (store not found)", async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      const request = buildRequest("/api/orders", "Bearer unknown-key-123");

      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });

    it("should reject API keys for soft-deleted stores", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        status: "ACTIVE",
        deletedAt: new Date(), // soft-deleted
      });
      const request = buildRequest("/api/orders", "Bearer store-1");

      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });
  });

  // ========================================================================
  // Valid API keys
  // ========================================================================
  describe("valid API keys", () => {
    it("should set request.storeId for valid active API keys", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        status: "ACTIVE",
        deletedAt: null,
      });
      const request = buildRequest("/api/orders", "Bearer store-1");

      await preHandler(request, {});

      expect(request.storeId).toBe("store-1");
    });
  });

  // ========================================================================
  // Suspended stores
  // ========================================================================
  describe("suspended stores", () => {
    it("should reject requests from suspended stores with STORE_SUSPENDED", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        status: "SUSPENDED",
        deletedAt: null,
      });
      const request = buildRequest("/api/orders", "Bearer store-1");

      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.STORE_SUSPENDED,
      });
    });
  });

  // ========================================================================
  // Uninstalled stores
  // ========================================================================
  describe("uninstalled stores", () => {
    it("should reject requests from uninstalled stores with UNAUTHORIZED", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        status: "UNINSTALLED",
        deletedAt: null,
      });
      const request = buildRequest("/api/orders", "Bearer store-1");

      await expect(preHandler(request, {})).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });
  });
});
