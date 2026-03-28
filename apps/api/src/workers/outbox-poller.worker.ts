import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import {
  pollOutboxEvents,
  markOutboxEventPublished,
  markOutboxEventFailed,
} from "../lib/outbox/index.js";
import type { QueueMap } from "./queues.js";

interface OutboxPollerConfig {
  pollIntervalMs: number;
  batchSize: number;
}

function getTargetQueues(eventType: string): string[] {
  const targets: string[] = [];

  targets.push("webhook-delivery");

  if (eventType === "shipment.created") {
    targets.push("label-generation");
  }

  return targets;
}

export function startOutboxPoller(
  prisma: PrismaClient,
  queues: QueueMap,
  config: OutboxPollerConfig
): { stop: () => void } {
  let isRunning = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (!isRunning) return;

    try {
      const events = await pollOutboxEvents(prisma, config.batchSize);

      for (const event of events) {
        try {
          const targetQueues = getTargetQueues(event.eventType);

          for (const queueName of targetQueues) {
            const queue = queues[queueName as keyof QueueMap];
            if (!queue) {
              console.warn(
                `Outbox poller: queue "${queueName}" not found for event ${event.eventType}`
              );
              continue;
            }

            await queue.add(
              event.eventType,
              {
                outboxEventId: event.id,
                storeId: event.storeId,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                payload: event.payload,
              },
              {
                jobId: `outbox-${event.id}-${queueName}`,
                attempts: 3,
                backoff: { type: "exponential", delay: 2000 },
              }
            );
          }

          await markOutboxEventPublished(prisma, event.id);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Outbox poller: failed to publish event ${event.id}: ${errorMessage}`
          );
          await markOutboxEventFailed(
            prisma,
            event.id,
            errorMessage,
            event.attempts
          );
        }
      }
    } catch (error) {
      console.error("Outbox poller: poll cycle failed:", error);
    }

    if (isRunning) {
      timeoutId = setTimeout(poll, config.pollIntervalMs);
    }
  }

  timeoutId = setTimeout(poll, 0);

  return {
    stop() {
      isRunning = false;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}
