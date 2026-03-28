import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { QueueMap } from "../workers/queues.js";
import type { Env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    queues: QueueMap;
    env: Env;
  }

  interface FastifyRequest {
    storeId: string;
    idempotencyKeyId?: string;
  }
}
