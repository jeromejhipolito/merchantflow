-- CreateEnum: ProductStatus
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateTable: products
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "store_id" UUID NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "product_type" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "sku" TEXT,
    "barcode" TEXT,
    "inventory_quantity" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(10,2),
    "weight_unit" VARCHAR(5) DEFAULT 'kg',
    "price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "hs_code" VARCHAR(12),
    "country_of_origin" VARCHAR(2),
    "shopify_synced_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique product per store (idempotent sync)
CREATE UNIQUE INDEX "uq_store_shopify_product" ON "products"("store_id", "shopify_product_id");

-- CreateIndex: store-scoped status queries
CREATE INDEX "products_store_id_status_idx" ON "products"("store_id", "status");

-- CreateIndex: store-scoped SKU lookup
CREATE INDEX "products_store_id_sku_idx" ON "products"("store_id", "sku");

-- CreateIndex: store-scoped sync freshness
CREATE INDEX "products_store_id_shopify_synced_at_idx" ON "products"("store_id", "shopify_synced_at");

-- AddForeignKey: products -> stores
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
