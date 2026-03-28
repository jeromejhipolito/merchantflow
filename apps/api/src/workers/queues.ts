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

export async function closeQueues(queues: QueueMap): Promise<void> {
  await Promise.all(
    Object.values(queues).map((q) => (q as Queue).close())
  );
}
