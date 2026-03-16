// =============================================================================
// Shopify Inbound Webhook Routes
// =============================================================================
// POST /webhooks/shopify — Receives webhooks from Shopify
//
// CRITICAL: This route must use a raw body parser, NOT the default JSON parser.
// Shopify signs the raw bytes of the request body. If we parse it as JSON and
// re-serialize, the HMAC verification will fail due to whitespace/key ordering
// differences.
//
// We configure Fastify's content type parser to store the raw body as a Buffer
// alongside the parsed JSON, so we have both for HMAC verification and processing.

import type { FastifyInstance } from "fastify";
import { handleShopifyWebhook } from "../modules/webhook/shopify-webhook.handler.js";

export async function registerShopifyWebhookRoutes(
  app: FastifyInstance
): Promise<void> {
  // Override the JSON content type parser for this route scope to capture raw body
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      try {
        // Store raw body for HMAC verification
        const rawBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
        (request as unknown as { rawBody: Buffer }).rawBody = rawBuffer;
        // Parse JSON for processing
        const parsed = JSON.parse(rawBuffer.toString("utf-8"));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.post("/shopify", async (request, reply) => {
    const deps = {
      prisma: app.prisma,
      queues: app.queues,
      shopifyApiSecret: app.env.SHOPIFY_API_SECRET,
    };

    await handleShopifyWebhook(request, reply, deps);
  });
}
