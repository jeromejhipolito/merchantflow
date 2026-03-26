// =============================================================================
// Order Sync Worker
// =============================================================================
// Processes jobs from the "order-sync" queue. These jobs are dispatched by
// the Shopify webhook handler when it receives orders/create, orders/updated,
// or orders/cancelled events.
//
// V2: Now uses the Saga Orchestrator instead of direct service calls.
// Each order sync runs through the Order Processing Saga:
//   1. ValidatePayload -> 2. UpsertOrder -> 3. UpdateInventory -> 4. DeliverWebhooks
//
// Benefits over the previous single-shot approach:
// - Step-level idempotency: re-processing the same webhook skips completed steps
// - Compensation: if inventory update fails, the order upsert is rolled back
// - Observability: every step transition is persisted with timestamps
// - Resumability: if the process crashes, the saga resumes from where it left off
//
// Job payload:
//   { webhookId, topic, shopDomain, payload, receivedAt }
//
// Failure handling:
// - The saga orchestrator retries each step up to maxRetries (configured per step)
// - If all retries fail, compensating transactions run in reverse order
// - BullMQ still retries the entire job 5 times with exponential backoff
// - After BullMQ exhausts retries, the job lands in the failed set
// - The saga's durable state means we can always inspect what happened

import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import {
  SagaOrchestrator,
  generateIdempotencyKey,
} from "../lib/saga/index.js";
import { PrismaSagaStore } from "../lib/saga/prisma-saga-store.js";
import {
  createOrderProcessingSaga,
  type OrderProcessingContext,
} from "../modules/order/order-processing.saga.js";

interface OrderSyncJobData {
  webhookId: string;
  topic: string;
  shopDomain: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export function createOrderSyncWorker(
  redis: Redis,
  prisma: PrismaClient
): Worker {
  const sagaStore = new PrismaSagaStore(prisma);

  // Create a structured logger that writes to BullMQ job logs.
  // In a full setup, this would be a pino child logger.
  const createJobLogger = (job: Job) => ({
    info: (obj: Record<string, unknown>, msg: string) => {
      job.log(`[INFO] ${msg} ${JSON.stringify(obj)}`);
    },
    warn: (obj: Record<string, unknown>, msg: string) => {
      job.log(`[WARN] ${msg} ${JSON.stringify(obj)}`);
    },
    error: (obj: Record<string, unknown>, msg: string) => {
      job.log(`[ERROR] ${msg} ${JSON.stringify(obj)}`);
    },
  });

  const worker = new Worker<OrderSyncJobData>(
    "order-sync",
    async (job: Job<OrderSyncJobData>) => {
      const { webhookId, topic, shopDomain, payload } = job.data;

      const logger = createJobLogger(job);
      logger.info({ webhookId, topic, shopDomain }, "Processing order webhook via saga");

      // Mark webhook as processing
      await prisma.shopifyWebhookLog.update({
        where: { shopifyWebhookId: webhookId },
        data: { status: "PROCESSING" },
      });

      try {
        // Look up the store
        const store = await prisma.store.findUnique({
          where: { shopifyDomain: shopDomain },
        });

        if (!store) {
          logger.warn({ shopDomain }, "Store not found — skipping");
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "FAILED",
              errorMessage: `Store not found for domain: ${shopDomain}`,
            },
          });
          return; // don't retry — store doesn't exist
        }

        // Build the saga initial context
        const shopifyOrder = payload as Record<string, any>;
        const initialContext: OrderProcessingContext = {
          storeId: store.id,
          shopifyOrderId: String(shopifyOrder.id),
          topic,
          webhookId,
          shopifyPayload: shopifyOrder,
        };

        // Generate saga-level idempotency key:
        // sha256(storeId + shopifyOrderId + topic)
        // This means re-processing the same webhook returns the cached result
        const sagaIdempotencyKey = generateIdempotencyKey(
          store.id,
          String(shopifyOrder.id),
          topic
        );

        // Create the saga definition (steps close over prisma)
        const sagaDefinition = createOrderProcessingSaga(prisma);

        // Execute the saga
        const orchestrator = new SagaOrchestrator(sagaStore, logger);
        const result = await orchestrator.execute(
          sagaDefinition,
          initialContext,
          sagaIdempotencyKey,
          store.id
        );

        if (result.cached) {
          logger.info(
            { sagaId: result.sagaId, outcome: result.outcome },
            "Saga returned cached result (duplicate webhook)"
          );
        }

        if (result.outcome === "COMPLETED") {
          // Mark webhook as processed
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "PROCESSED",
              processedAt: new Date(),
            },
          });

          logger.info(
            {
              sagaId: result.sagaId,
              orderId: result.context.orderId,
              orderNumber: result.context.orderNumber,
            },
            "Order processing saga completed successfully"
          );
        } else {
          // Saga was compensated or failed
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "FAILED",
              errorMessage: result.error ?? "Saga did not complete",
            },
          });

          // Throw to trigger BullMQ retry at the job level
          throw new Error(
            `Order processing saga ${result.outcome}: ${result.error}`
          );
        }
      } catch (error) {
        // Mark webhook as failed (if not already updated above)
        try {
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "FAILED",
              errorMessage:
                error instanceof Error ? error.message : String(error),
            },
          });
        } catch {
          // Webhook status update failed — log but don't mask the original error
        }
        throw error; // re-throw so BullMQ retries
      }
    },
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 10_000,
      },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `Order sync job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`
    );
  });

  return worker;
}
