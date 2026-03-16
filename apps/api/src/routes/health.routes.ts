// =============================================================================
// Health Check Routes
// =============================================================================
// Two endpoints following the standard health check pattern:
//
// GET /health         — Shallow check. Returns 200 if the process is running.
//                       Used by load balancers and container orchestrators.
//
// GET /health/ready   — Deep check. Verifies database and Redis connectivity.
//                       Used by Kubernetes readiness probes — traffic is only
//                       routed to this instance if it returns 200.

import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  // Shallow health check — is the process alive?
  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Deep health check — are all dependencies reachable?
  app.get("/health/ready", async (request, reply) => {
    const checks: Record<string, "ok" | "error"> = {};

    // Database check
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    // Redis check
    try {
      const redis = app.redis;
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const allHealthy = Object.values(checks).every((v) => v === "ok");

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
