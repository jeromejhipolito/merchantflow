import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerHealthRoutes } from "../health.routes.js";

// ---------------------------------------------------------------------------
// Helpers — lightweight Fastify route simulation
// ---------------------------------------------------------------------------
type RouteHandler = (request: any, reply: any) => Promise<any>;

function buildApp() {
  const routes: Record<string, RouteHandler> = {};

  return {
    get: vi.fn((path: string, handler: RouteHandler) => {
      routes[path] = handler;
    }),
    // These are set by the test to simulate decorated properties
    prisma: {
      $queryRaw: vi.fn(),
    },
    redis: {
      ping: vi.fn(),
    },
    getRoute(path: string): RouteHandler {
      const handler = routes[path];
      if (!handler) throw new Error(`No route registered for ${path}`);
      return handler;
    },
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
describe("Health Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    await registerHealthRoutes(app);
  });

  // ========================================================================
  // GET /health
  // ========================================================================
  describe("GET /health", () => {
    it("should return 200 with status 'ok'", async () => {
      const handler = app.getRoute("/health");
      const reply = buildReply();

      await handler({}, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ok",
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        })
      );
    });
  });

  // ========================================================================
  // GET /health/ready
  // ========================================================================
  describe("GET /health/ready", () => {
    it("should return 200 when database and Redis are healthy", async () => {
      app.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      app.redis.ping.mockResolvedValue("PONG");

      const handler = app.getRoute("/health/ready");
      const reply = buildReply();

      await handler({}, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ok",
          checks: {
            database: "ok",
            redis: "ok",
          },
        })
      );
    });

    it("should return 503 when database is down", async () => {
      app.prisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));
      app.redis.ping.mockResolvedValue("PONG");

      const handler = app.getRoute("/health/ready");
      const reply = buildReply();

      await handler({}, reply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "degraded",
          checks: expect.objectContaining({
            database: "error",
          }),
        })
      );
    });

    it("should return 503 when Redis is down", async () => {
      app.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      app.redis.ping.mockRejectedValue(new Error("Redis not available"));

      const handler = app.getRoute("/health/ready");
      const reply = buildReply();

      await handler({}, reply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "degraded",
          checks: expect.objectContaining({
            redis: "error",
          }),
        })
      );
    });

    it("should return 503 when both database and Redis are down", async () => {
      app.prisma.$queryRaw.mockRejectedValue(new Error("DB down"));
      app.redis.ping.mockRejectedValue(new Error("Redis down"));

      const handler = app.getRoute("/health/ready");
      const reply = buildReply();

      await handler({}, reply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "degraded",
          checks: {
            database: "error",
            redis: "error",
          },
        })
      );
    });
  });
});
