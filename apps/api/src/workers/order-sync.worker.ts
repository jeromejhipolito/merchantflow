// =============================================================================
// Order Sync Worker
// =============================================================================
// Processes jobs from the "order-sync" queue. These jobs are dispatched by
// the Shopify webhook handler when it receives orders/create, orders/updated,
// or orders/cancelled events.
//
// Job payload:
//   { webhookId, topic, shopDomain, payload, receivedAt }
//
// Processing steps:
// 1. Look up the store by shopDomain
// 2. Map the Shopify order payload to our domain model
// 3. Upsert the order via OrderService (idempotent by shopifyOrderId)
// 4. Mark the webhook log as PROCESSED
// 5. On failure, mark the webhook log as FAILED with error message
//
// Failure handling:
// - BullMQ retries 5 times with exponential backoff (2s, 4s, 8s, 16s, 32s)
// - After all retries exhausted, the job lands in the failed set
// - The cleanup worker periodically reports on dead-lettered jobs
// - We can manually re-process via an admin endpoint

import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { OrderService } from "../modules/order/order.service.js";

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
  const orderService = new OrderService(prisma);

  const worker = new Worker<OrderSyncJobData>(
    "order-sync",
    async (job: Job<OrderSyncJobData>) => {
      const { webhookId, topic, shopDomain, payload } = job.data;

      job.log(`Processing ${topic} from ${shopDomain} (webhook: ${webhookId})`);

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
          job.log(`Store not found for domain ${shopDomain} — skipping`);
          await prisma.shopifyWebhookLog.update({
            where: { shopifyWebhookId: webhookId },
            data: {
              status: "FAILED",
              errorMessage: `Store not found for domain: ${shopDomain}`,
            },
          });
          return; // don't retry — store doesn't exist
        }

        if (topic === "orders/cancelled") {
          // For cancellations, we just update the financial status
          // The upsert handles this — Shopify sends the full order
        }

        // Map Shopify payload to our domain input
        const shopifyOrder = payload as Record<string, any>;

        await orderService.upsertFromShopify({
          storeId: store.id,
          shopifyOrderId: String(shopifyOrder.id),
          orderNumber: String(shopifyOrder.order_number ?? shopifyOrder.name),
          subtotalPrice: String(shopifyOrder.subtotal_price ?? "0"),
          totalTax: String(shopifyOrder.total_tax ?? "0"),
          totalShipping: String(
            shopifyOrder.total_shipping_price_set?.shop_money?.amount ?? "0"
          ),
          totalDiscount: String(shopifyOrder.total_discounts ?? "0"),
          totalPrice: String(shopifyOrder.total_price ?? "0"),
          currencyCode: shopifyOrder.currency ?? "USD",
          financialStatus: shopifyOrder.financial_status ?? "pending",
          fulfillmentStatus: shopifyOrder.fulfillment_status,
          customer: shopifyOrder.customer
            ? {
                email: shopifyOrder.customer.email,
                firstName: shopifyOrder.customer.first_name,
                lastName: shopifyOrder.customer.last_name,
                phone: shopifyOrder.customer.phone,
              }
            : undefined,
          shippingAddress: shopifyOrder.shipping_address
            ? {
                address1: shopifyOrder.shipping_address.address1,
                address2: shopifyOrder.shipping_address.address2,
                city: shopifyOrder.shipping_address.city,
                province: shopifyOrder.shipping_address.province,
                zip: shopifyOrder.shipping_address.zip,
                countryCode: shopifyOrder.shipping_address.country_code,
                phone: shopifyOrder.shipping_address.phone,
              }
            : undefined,
          lineItems: (shopifyOrder.line_items ?? []).map((li: any) => ({
            shopifyLineItemId: String(li.id),
            title: li.title,
            variantTitle: li.variant_title,
            sku: li.sku,
            quantity: li.quantity,
            price: String(li.price),
          })),
          shopifyCreatedAt: shopifyOrder.created_at,
        });

        // Mark webhook as processed
        await prisma.shopifyWebhookLog.update({
          where: { shopifyWebhookId: webhookId },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
          },
        });

        job.log(`Successfully processed ${topic} for order ${shopifyOrder.order_number}`);
      } catch (error) {
        // Mark webhook as failed
        await prisma.shopifyWebhookLog.update({
          where: { shopifyWebhookId: webhookId },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
        throw error; // re-throw so BullMQ retries
      }
    },
    {
      connection: redis,
      concurrency: 5, // process up to 5 orders in parallel
      limiter: {
        max: 20, // rate limit: max 20 jobs per 10 seconds
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
