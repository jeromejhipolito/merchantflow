-- CreateEnum: StoreStatus
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'UNINSTALLED');

-- CreateExtension: pgcrypto (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable: stores
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "shopify_domain" TEXT NOT NULL,
    "shopify_access_token" TEXT NOT NULL,
    "shopify_scopes" TEXT NOT NULL,
    "shopify_webhook_secret" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique shopify domain per store
CREATE UNIQUE INDEX "stores_shopify_domain_key" ON "stores"("shopify_domain");

-- CreateIndex: status for filtered queries
CREATE INDEX "stores_status_idx" ON "stores"("status");

-- CreateIndex: domain lookup
CREATE INDEX "stores_shopify_domain_idx" ON "stores"("shopify_domain");
