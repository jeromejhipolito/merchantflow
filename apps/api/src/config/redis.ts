import { Redis } from "ioredis";
import type { Env } from "./env.js";

export function createRedisClient(env: Env): Redis {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: true,
    retryStrategy(times: number) {
      // Exponential backoff capped at 30 seconds
      return Math.min(times * 200, 30_000);
    },
  });

  return redis;
}
