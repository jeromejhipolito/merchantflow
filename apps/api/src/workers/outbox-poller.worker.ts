// =============================================================================
// Outbox Poller Worker
// =============================================================================
// This is NOT a BullMQ worker — it's a standalone polling loop that runs
// as a separate process (or as a repeatable BullMQ job for simplicity).
//
// It polls the outbox_events table for PENDING events and dispatches them
// to the appropriate BullMQ queues based on event type.
//
// Event routing:
//   order.*     -> webhook-delivery queue (for merchant webhooks)
//   shipment.*  -> webhook-delivery queue + label-generation queue
//   store.*     -> webhook-delivery queue
//
// The poller uses FOR UPDATE SKIP LOCKED to prevent duplicate processing
// when multiple poller instances are running (horizontal scaling).

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

/**
 * Routes an outbox event to the appropriate BullMQ queue(s).
 * Some events dispatch to multiple queues.
 */
function getTargetQueues(eventType: string): string[] {
  const targets: string[] = [];

  // All domain events go to webhook delivery (for merchant-configured webhooks)
  targets.push("webhook-delivery");

  // Shipment-specific routing
  if (eventType === "shipment.created") {
    targets.push("label-generation");
  }

  return targets;
}

/**
 * Starts the outbox poller loop.
 * Returns a cleanup function to stop polling.
 */
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

          // Dispatch to all target queues
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
                jobId: `outbox-${event.id}-${queueName}`, // deduplicate
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
      // Poll failure — log and continue on next interval
      console.error("Outbox poller: poll cycle failed:", error);
    }

    // Schedule next poll
    if (isRunning) {
      timeoutId = setTimeout(poll, config.pollIntervalMs);
    }
  }

  // Start the first poll
  timeoutId = setTimeout(poll, 0);

  return {
    stop() {
      isRunning = false;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}
