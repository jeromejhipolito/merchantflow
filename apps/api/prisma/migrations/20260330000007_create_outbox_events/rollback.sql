-- Rollback: 20260330000007_create_outbox_events
-- Drops the outbox_events table and OutboxEventStatus enum.
-- WARNING: Pending events will be lost. Ensure the outbox poller is stopped before rolling back.

DROP TABLE IF EXISTS "outbox_events" CASCADE;
DROP TYPE IF EXISTS "OutboxEventStatus";
