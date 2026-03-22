-- CreateEnum: OrderFinancialStatus
CREATE TYPE "OrderFinancialStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum: OrderFulfillmentStatus
CREATE TYPE "OrderFulfillmentStatus" AS ENUM ('UNFULFILLED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'RESTOCKED');

-- CreateTable: orders
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "store_id" UUID NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "subtotal_price" DECIMAL(12,2) NOT NULL,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_shipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(12,2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "financial_status" "OrderFinancialStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillment_status" "OrderFulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "customer_email" TEXT,
    "customer_first_name" TEXT,
    "customer_last_name" TEXT,
    "customer_phone" TEXT,
    "shipping_address_line1" TEXT,
    "shipping_address_line2" TEXT,
    "shipping_city" TEXT,
    "shipping_province" TEXT,
    "shipping_postal_code" TEXT,
    "shipping_country_code" VARCHAR(2),
    "shipping_phone" TEXT,
    "customs_declaration_value" DECIMAL(12,2),
    "shopify_created_at" TIMESTAMP(3),
    "shopify_synced_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique order per store (prevents duplicate webhook ingestion)
CREATE UNIQUE INDEX "uq_store_shopify_order" ON "orders"("store_id", "shopify_order_id");

-- CreateIndex: store-scoped fulfillment status filter
CREATE INDEX "orders_store_id_fulfillment_status_idx" ON "orders"("store_id", "fulfillment_status");

-- CreateIndex: store-scoped financial status filter
CREATE INDEX "orders_store_id_financial_status_idx" ON "orders"("store_id", "financial_status");

-- CreateIndex: store-scoped chronological listing
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at");

-- CreateIndex: store-scoped customer email search
CREATE INDEX "orders_store_id_customer_email_idx" ON "orders"("store_id", "customer_email");

-- CreateIndex: store-scoped order number search
CREATE INDEX "orders_store_id_order_number_idx" ON "orders"("store_id", "order_number");

-- AddForeignKey: orders -> stores
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: line_items
CREATE TABLE "line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "shopify_line_item_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "fulfilled_quantity" INTEGER NOT NULL DEFAULT 0,
    "hs_code" VARCHAR(12),
    "country_of_origin" VARCHAR(2),
    "weight" DECIMAL(10,2),
    "weight_unit" VARCHAR(5) DEFAULT 'kg',

    CONSTRAINT "line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique line item per order (idempotent sync)
CREATE UNIQUE INDEX "uq_order_shopify_line_item" ON "line_items"("order_id", "shopify_line_item_id");

-- CreateIndex: order lookup
CREATE INDEX "line_items_order_id_idx" ON "line_items"("order_id");

-- CreateIndex: product reference
CREATE INDEX "line_items_product_id_idx" ON "line_items"("product_id");

-- AddForeignKey: line_items -> orders
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: line_items -> products (nullable, SET NULL on delete)
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
