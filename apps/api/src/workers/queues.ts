// =============================================================================
// BullMQ Queue Definitions
// =============================================================================
// All queues are defined here. Each queue has a corresponding worker file.
//
// Queue naming convention: kebab-case, describing the domain action.
//
// Queue catalog:
//   order-sync       — Process incoming Shopify order webhooks
//   product-sync     — Process incoming Shopify product webhooks
//   store-lifecycle  — Handle app/uninstalled and other store events
//   label-generation — Generate shipping labels via carrier APIs
//   webhook-delivery — Deliver outbound webhooks to merchant endpoints
//   outbox-publish   — Internal: outbox poller dispatches events here
//   inventory-sync   — Periodic full inventory sync from Shopify
//   cleanup          — Periodic cleanup of expired idempotency keys, old logs

import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export interface QueueMap {
  "order-sync": Queue;
  "product-sync": Queue;
  "store-lifecycle": Queue;
  "label-generation": Queue;
  "webhook-delivery": Queue;
  "outbox-publish": Queue;
  "inventory-sync": Queue;
  cleanup: Queue;
}

const QUEUE_NAMES: (keyof QueueMap)[] = [
  "order-sync",
  "product-sync",
  "store-lifecycle",
  "label-generation",
  "webhook-delivery",
  "outbox-publish",
  "inventory-sync",
  "cleanup",
];

/**
 * Creates all BullMQ queues sharing a single Redis connection.
 */
export function createQueues(redis: Redis): QueueMap {
  const queues: Partial<QueueMap> = {};

  for (const name of QUEUE_NAMES) {
    queues[name] = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  return queues as QueueMap;
}

/**
 * Gracefully closes all queues.
 */
export async function closeQueues(queues: QueueMap): Promise<void> {
  await Promise.all(
    Object.values(queues).map((q) => (q as Queue).close())
  );
}
