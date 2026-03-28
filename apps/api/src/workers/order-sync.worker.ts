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

      await prisma.shopifyWebhookLog.update({
        where: { shopifyWebhookId: webhookId },
        data: { status: "PROCESSING" },
      });

      try {
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
          return;
        }

        const shopifyOrder = payload as Record<string, any>;
        const initialContext: OrderProcessingContext = {
          storeId: store.id,
          shopifyOrderId: String(shopifyOrder.id),
          topic,
          webhookId,
          shopifyPayload: shopifyOrder,
        };

        const sagaIdempotencyKey = generateIdempotencyKey(
          store.id,
          String(shopifyOrder.id),
          topic
        );

        const sagaDefinition = createOrderProcessingSaga(prisma);
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
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "FAILED",
              errorMessage: result.error ?? "Saga did not complete",
            },
          });

          throw new Error(
            `Order processing saga ${result.outcome}: ${result.error}`
          );
        }
      } catch (error) {
        try {
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "FAILED",
              errorMessage:
                error instanceof Error ? error.message : String(error),
            },
          });
        } catch {}
        throw error;
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
