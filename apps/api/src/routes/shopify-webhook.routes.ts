import type { FastifyInstance } from "fastify";
import { handleShopifyWebhook } from "../modules/webhook/shopify-webhook.handler.js";

export async function registerShopifyWebhookRoutes(
  app: FastifyInstance
): Promise<void> {
  // raw body parser for HMAC verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      try {
        const rawBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
        (request as unknown as { rawBody: Buffer }).rawBody = rawBuffer;
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
