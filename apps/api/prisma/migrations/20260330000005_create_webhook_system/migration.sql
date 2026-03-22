-- CreateEnum: WebhookDeliveryStatus
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum: ShopifyWebhookStatus
CREATE TYPE "ShopifyWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable: webhook_endpoints (outbound — merchant-configured URLs)
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "store_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failed_at" TIMESTAMP(3),
    "last_succeeded_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "disabled_reason" TEXT,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: store-scoped active endpoints
CREATE INDEX "webhook_endpoints_store_id_is_active_idx" ON "webhook_endpoints"("store_id", "is_active");

-- AddForeignKey: webhook_endpoints -> stores
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: webhook_deliveries (outbound delivery attempts)
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "http_status" INTEGER,
    "response_body" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: endpoint-scoped status filter
CREATE INDEX "webhook_deliveries_endpoint_id_status_idx" ON "webhook_deliveries"("endpoint_id", "status");

-- CreateIndex: retry poller query
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex: chronological listing
CREATE INDEX "webhook_deliveries_created_at_idx" ON "webhook_deliveries"("created_at");

-- AddForeignKey: webhook_deliveries -> webhook_endpoints
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: shopify_webhook_logs (inbound deduplication)
CREATE TABLE "shopify_webhook_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopify_webhook_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopify_domain" TEXT NOT NULL,
    "status" "ShopifyWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "shopify_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique webhook ID (Shopify deduplication — the core reliability pattern)
CREATE UNIQUE INDEX "shopify_webhook_logs_shopify_webhook_id_key" ON "shopify_webhook_logs"("shopify_webhook_id");

-- CreateIndex: domain + topic for analytics
CREATE INDEX "shopify_webhook_logs_shopify_domain_topic_idx" ON "shopify_webhook_logs"("shopify_domain", "topic");

-- CreateIndex: chronological cleanup
CREATE INDEX "shopify_webhook_logs_created_at_idx" ON "shopify_webhook_logs"("created_at");
