// =============================================================================
// Shopify Inbound Webhook Handler
// =============================================================================
// Receives webhooks FROM Shopify. The pipeline:
//
// 1. RECEIVE: Fastify raw body parser captures the exact bytes
// 2. VERIFY: HMAC-SHA256 signature verification using X-Shopify-Hmac-Sha256
// 3. DEDUPLICATE: Check X-Shopify-Webhook-Id against shopify_webhook_logs table
// 4. LOG: Insert the webhook into shopify_webhook_logs with status RECEIVED
// 5. DISPATCH: Enqueue a BullMQ job for async processing
// 6. RESPOND: Return 200 immediately (Shopify retries on non-2xx after 5s)
//
// Why respond before processing?
// Shopify has a 5-second timeout for webhook responses. If we process
// synchronously and it takes longer, Shopify will retry, causing duplicates.
// By responding immediately and processing asynchronously, we avoid this.
//
// Deduplication:
// Shopify retries webhooks up to 19 times over 48 hours on non-2xx responses.
// The X-Shopify-Webhook-Id header is unique per delivery attempt. We store it
// so that if Shopify retries (because our 200 was lost in transit), we return
// 200 without re-processing.

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
  shopifyApiSecret: string; // fallback secret for webhook verification
}

/**
 * Handles an incoming Shopify webhook.
 *
 * This is registered as the handler for POST /webhooks/shopify.
 * The route MUST be configured with a raw body parser (addContentTypeParser)
 * so we receive the exact bytes Shopify signed.
 */
export async function handleShopifyWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ShopifyWebhookDeps
): Promise<void> {
  // -------------------------------------------------------------------------
  // Step 1: Extract headers
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Step 2: Verify HMAC signature
  // -------------------------------------------------------------------------
  // The raw body must be the exact bytes Shopify sent (not re-serialized).
  // Fastify stores this via the rawBody plugin or custom content type parser.
  const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: "Raw body not available. The webhook route must use a raw body parser.",
      isOperational: false,
    });
  }

  // Try per-store secret first, then fall back to app-level secret
  let secret = deps.shopifyApiSecret;
  try {
    const store = await deps.prisma.store.findUnique({
      where: { shopifyDomain: shopDomain },
      select: { shopifyWebhookSecret: true },
    });
    if (store?.shopifyWebhookSecret) {
      secret = store.shopifyWebhookSecret;
    }
  } catch {
    // If store lookup fails, use the app-level secret
  }

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

  // -------------------------------------------------------------------------
  // Step 3: Deduplicate by X-Shopify-Webhook-Id
  // -------------------------------------------------------------------------
  const existingLog = await deps.prisma.shopifyWebhookLog.findUnique({
    where: { shopifyWebhookId: webhookId },
  });

  if (existingLog) {
    // Already received — return 200 without re-processing
    request.log.info(
      { webhookId, topic, status: existingLog.status },
      "Duplicate Shopify webhook — already processed"
    );
    reply.status(200).send({ status: "duplicate", webhookId });
    return;
  }

  // -------------------------------------------------------------------------
  // Step 4: Log the webhook
  // -------------------------------------------------------------------------
  await deps.prisma.shopifyWebhookLog.create({
    data: {
      shopifyWebhookId: webhookId,
      topic,
      shopifyDomain: shopDomain,
      status: "RECEIVED",
    },
  });

  // -------------------------------------------------------------------------
  // Step 5: Dispatch to appropriate BullMQ queue
  // -------------------------------------------------------------------------
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
    // Still return 200 — we've logged it, we can reprocess later
    reply.status(200).send({ status: "logged", reason: "queue unavailable" });
    return;
  }

  const body = JSON.parse(rawBody.toString("utf-8"));

  await queue.add(
    topic, // job name
    {
      webhookId,
      topic,
      shopDomain,
      payload: body,
      receivedAt: new Date().toISOString(),
    },
    {
      // BullMQ job options
      jobId: webhookId, // deduplicate at the queue level too
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs
      removeOnFail: { count: 5000 }, // keep last 5000 failed jobs for debugging
    }
  );

  // -------------------------------------------------------------------------
  // Step 6: Respond immediately
  // -------------------------------------------------------------------------
  reply.status(200).send({ status: "accepted", webhookId });
}
