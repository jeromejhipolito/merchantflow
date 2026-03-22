-- CreateEnum: ShipmentStatus
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'LABEL_GENERATING', 'LABEL_READY', 'LABEL_FAILED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateTable: shipments
CREATE TABLE "shipments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "carrier" TEXT,
    "service" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "label_url" TEXT,
    "label_format" VARCHAR(10),
    "label_generated_at" TIMESTAMP(3),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "weight_grams" INTEGER,
    "length_cm" DECIMAL(8,2),
    "width_cm" DECIMAL(8,2),
    "height_cm" DECIMAL(8,2),
    "customs_declaration_value" DECIMAL(12,2),
    "customs_currency" VARCHAR(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "external_shipment_id" TEXT,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: store-scoped status filter
CREATE INDEX "shipments_store_id_status_idx" ON "shipments"("store_id", "status");

-- CreateIndex: store-scoped order lookup
CREATE INDEX "shipments_store_id_order_id_idx" ON "shipments"("store_id", "order_id");

-- CreateIndex: order lookup (for order detail pages)
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex: tracking number lookup (carrier callbacks)
CREATE INDEX "shipments_tracking_number_idx" ON "shipments"("tracking_number");

-- AddForeignKey: shipments -> stores
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: shipments -> orders
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
