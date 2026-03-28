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
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  const prisma = createPrismaClient(env);
  const redis = createRedisClient(env);
  const queues = createQueues(redis);

  app.decorate("prisma", prisma);
  app.decorate("redis", redis);
  app.decorate("queues", queues);
  app.decorate("env", env);

  registerErrorHandler(app);
  registerAuthMiddleware(app, prisma);

  app.addHook(
    "preHandler",
    createIdempotencyHook(prisma, {
      ttlHours: parseInt(env.IDEMPOTENCY_KEY_TTL_HOURS, 10),
    })
  );
  app.addHook("onSend", createIdempotencyResponseHook(prisma));

  await registerRoutes(app);

  const orderSyncWorker = createOrderSyncWorker(redis, prisma);
  const labelGenWorker = createLabelGenerationWorker(redis, prisma);
  const outboxPoller = startOutboxPoller(prisma, queues, {
    pollIntervalMs: parseInt(env.OUTBOX_POLL_INTERVAL_MS, 10),
    batchSize: parseInt(env.OUTBOX_BATCH_SIZE, 10),
  });

  await app.listen({ port: parseInt(env.PORT, 10), host: env.HOST });
  app.log.info(`MerchantFlow server listening on ${env.HOST}:${env.PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Starting graceful shutdown...`);

    await app.close();
    outboxPoller.stop();
    await orderSyncWorker.close();
    await labelGenWorker.close();

    await closeQueues(queues);
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
