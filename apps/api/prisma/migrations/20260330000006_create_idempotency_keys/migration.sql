-- CreateTable: idempotency_keys
-- Stores response cache for idempotent write operations.
-- Scoped to (store_id, key) so different tenants can reuse key strings.
-- Lock mechanism (locked_at) prevents concurrent processing of the same key.
-- Keys expire after TTL (default 24h) and are cleaned by a background job.
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "store_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "http_method" TEXT NOT NULL,
    "http_path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "locked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique key per tenant (the core idempotency constraint)
CREATE UNIQUE INDEX "uq_store_idempotency_key" ON "idempotency_keys"("store_id", "key");

-- CreateIndex: TTL cleanup job query
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey: idempotency_keys -> stores
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
