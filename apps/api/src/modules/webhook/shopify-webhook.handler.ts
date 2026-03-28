import type { FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import type { QueueMap } from "../../workers/queues.js";
import { verifyShopifyWebhookHmac } from "../../lib/hmac/index.js";
import { AppError, ErrorCode } from "../../lib/errors/index.js";

// Topic -> BullMQ queue name mapping
const TOPIC_TO_QUEUE: Record<string, keyof QueueMap> = {
  "orders/create": "order-sync",
  "orders/updated": "order-sync",
  "orders/cancelled": "order-sync",
  "products/create": "product-sync",
  "products/update": "product-sync",
  "products/delete": "product-sync",
  "app/uninstalled": "store-lifecycle",
};

export interface ShopifyWebhookDeps {
  prisma: PrismaClient;
  queues: QueueMap;
  shopifyApiSecret: string;
}

export async function handleShopifyWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ShopifyWebhookDeps
): Promise<void> {
  const hmacHeader = request.headers["x-shopify-hmac-sha256"] as string;
  const webhookId = request.headers["x-shopify-webhook-id"] as string;
  const topic = request.headers["x-shopify-topic"] as string;
  const shopDomain = request.headers["x-shopify-shop-domain"] as string;

  if (!hmacHeader || !webhookId || !topic || !shopDomain) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: "Missing required Shopify webhook headers.",
      details: {
        hasHmac: !!hmacHeader,
        hasWebhookId: !!webhookId,
        hasTopic: !!topic,
        hasShopDomain: !!shopDomain,
      },
    });
  }

  const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: "Raw body not available. The webhook route must use a raw body parser.",
      isOperational: false,
    });
  }

  let secret = deps.shopifyApiSecret;
  try {
    const store = await deps.prisma.store.findUnique({
      where: { shopifyDomain: shopDomain },
      select: { shopifyWebhookSecret: true },
    });
    if (store?.shopifyWebhookSecret) {
      secret = store.shopifyWebhookSecret;
    }
  } catch {}

  const isValid = verifyShopifyWebhookHmac(rawBody, hmacHeader, secret);
  if (!isValid) {
    request.log.warn(
      { shopDomain, topic, webhookId },
      "Invalid Shopify webhook HMAC signature"
    );
    throw new AppError({
      code: ErrorCode.INVALID_HMAC,
      message: "Invalid webhook signature.",
    });
  }

  // deduplicate by webhook ID
  const existingLog = await deps.prisma.shopifyWebhookLog.findUnique({
    where: { shopifyWebhookId: webhookId },
  });

  if (existingLog) {
    request.log.info(
      { webhookId, topic, status: existingLog.status },
      "Duplicate Shopify webhook — already processed"
    );
    reply.status(200).send({ status: "duplicate", webhookId });
    return;
  }

  await deps.prisma.shopifyWebhookLog.create({
    data: {
      shopifyWebhookId: webhookId,
      topic,
      shopifyDomain: shopDomain,
      status: "RECEIVED",
    },
  });

  const queueName = TOPIC_TO_QUEUE[topic];
  if (!queueName) {
    request.log.warn({ topic }, "Unrecognized Shopify webhook topic — ignoring");
    reply.status(200).send({ status: "ignored", reason: "unrecognized topic" });
    return;
  }

  const queue = deps.queues[queueName];
  if (!queue) {
    request.log.error(
      { queueName, topic },
      "BullMQ queue not found for webhook topic"
    );
    reply.status(200).send({ status: "logged", reason: "queue unavailable" });
    return;
  }

  const body = JSON.parse(rawBody.toString("utf-8"));

  await queue.add(
    topic,
    {
      webhookId,
      topic,
      shopDomain,
      payload: body,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId: webhookId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );

  reply.status(200).send({ status: "accepted", webhookId });
}
