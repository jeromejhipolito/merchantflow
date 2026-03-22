-- CreateEnum: OutboxEventStatus
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable: outbox_events
-- Transactional outbox for reliable at-least-once event delivery.
-- Events are written in the same DB transaction as domain mutations.
-- A background poller reads PENDING events using FOR UPDATE SKIP LOCKED
-- and dispatches them to BullMQ queues.
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "store_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: poller query (WHERE status = 'PENDING' ORDER BY created_at)
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- CreateIndex: aggregate lookup (for debugging and replay)
CREATE INDEX "outbox_events_store_id_aggregate_type_aggregate_id_idx" ON "outbox_events"("store_id", "aggregate_type", "aggregate_id");

-- CreateIndex: retry poller query
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "outbox_events"("status", "next_retry_at");

-- AddForeignKey: outbox_events -> stores
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
