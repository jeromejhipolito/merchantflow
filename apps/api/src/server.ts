// =============================================================================
// MerchantFlow — Fastify Server Bootstrap
// =============================================================================
// This is the entry point. It wires together:
// - Environment validation (fail fast on missing config)
// - Prisma client with multi-tenancy middleware
// - Redis client (shared by BullMQ + caching)
// - BullMQ queues and workers
// - Fastify plugins (CORS, rate limiting, request logging)
// - Authentication middleware
// - Idempotency middleware
// - Error handler
// - Route registration
// - Graceful shutdown
//
// Process model:
// - The web server and workers run in the SAME process for simplicity.
//   In production, you'd split workers into separate processes for
//   independent scaling (web: 4 replicas, workers: 2 replicas).
//
// Startup order matters:
// 1. Validate env -> 2. Connect DB -> 3. Connect Redis -> 4. Create queues
// -> 5. Register middleware -> 6. Register routes -> 7. Start workers
// -> 8. Start listening
//
// Shutdown order (reverse):
// 1. Stop accepting connections -> 2. Drain in-flight requests
// -> 3. Stop workers -> 4. Close queues -> 5. Close Redis -> 6. Close DB

import Fastify from "fastify";
import { loadEnv } from "./config/env.js";
import { createPrismaClient } from "./config/database.js";
import { createRedisClient } from "./config/redis.js";
import { createQueues, closeQueues } from "./workers/queues.js";
import { createOrderSyncWorker } from "./workers/order-sync.worker.js";
import { createLabelGenerationWorker } from "./workers/label-generation.worker.js";
import { startOutboxPoller } from "./workers/outbox-poller.worker.js";
import { registerAuthMiddleware } from "./middleware/auth.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import {
  createIdempotencyHook,
  createIdempotencyResponseHook,
} from "./lib/idempotency/index.js";
import { registerRoutes } from "./routes/index.js";

async function main() {
  // -------------------------------------------------------------------------
  // 1. Load and validate environment
  // -------------------------------------------------------------------------
  const env = loadEnv();

  // -------------------------------------------------------------------------
  // 2. Create Fastify instance
  // -------------------------------------------------------------------------
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Structured JSON logging in production, pretty in dev
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    // Request ID for tracing across logs
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  // -------------------------------------------------------------------------
  // 3. Connect infrastructure
  // -------------------------------------------------------------------------
  const prisma = createPrismaClient(env);
  const redis = createRedisClient(env);
  const queues = createQueues(redis);

  // Decorate Fastify with infrastructure (accessible in routes)
  app.decorate("prisma", prisma);
  app.decorate("redis", redis);
  app.decorate("queues", queues);
  app.decorate("env", env);

  // -------------------------------------------------------------------------
  // 4. Register middleware (order matters!)
  // -------------------------------------------------------------------------
  registerErrorHandler(app);
  registerAuthMiddleware(app, prisma);

  // Idempotency on API routes
  app.addHook(
    "preHandler",
    createIdempotencyHook(prisma, {
      ttlHours: parseInt(env.IDEMPOTENCY_KEY_TTL_HOURS, 10),
    })
  );
  app.addHook("onSend", createIdempotencyResponseHook(prisma));

  // -------------------------------------------------------------------------
  // 5. Register routes
  // -------------------------------------------------------------------------
  await registerRoutes(app);

  // -------------------------------------------------------------------------
  // 6. Start workers
  // -------------------------------------------------------------------------
  const orderSyncWorker = createOrderSyncWorker(redis, prisma);
  const labelGenWorker = createLabelGenerationWorker(redis, prisma);
  const outboxPoller = startOutboxPoller(prisma, queues, {
    pollIntervalMs: parseInt(env.OUTBOX_POLL_INTERVAL_MS, 10),
    batchSize: parseInt(env.OUTBOX_BATCH_SIZE, 10),
  });

  // -------------------------------------------------------------------------
  // 7. Start listening
  // -------------------------------------------------------------------------
  await app.listen({ port: parseInt(env.PORT, 10), host: env.HOST });
  app.log.info(`MerchantFlow server listening on ${env.HOST}:${env.PORT}`);

  // -------------------------------------------------------------------------
  // 8. Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    await app.close();

    // Stop workers
    outboxPoller.stop();
    await orderSyncWorker.close();
    await labelGenWorker.close();

    // Close queues
    await closeQueues(queues);

    // Close infrastructure
    redis.disconnect();
    await prisma.$disconnect();

    app.log.info("Graceful shutdown complete.");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
