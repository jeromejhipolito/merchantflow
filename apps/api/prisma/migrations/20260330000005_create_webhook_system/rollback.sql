-- Rollback: 20260330000005_create_webhook_system
-- Drops webhook tables and enums. Order: deliveries first (FK dependency), then endpoints, then logs.

DROP TABLE IF EXISTS "webhook_deliveries" CASCADE;
DROP TABLE IF EXISTS "webhook_endpoints" CASCADE;
DROP TABLE IF EXISTS "shopify_webhook_logs" CASCADE;
DROP TYPE IF EXISTS "WebhookDeliveryStatus";
DROP TYPE IF EXISTS "ShopifyWebhookStatus";
