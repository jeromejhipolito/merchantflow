-- Rollback: 20260330000006_create_idempotency_keys
-- Drops the idempotency_keys table.
-- Safe to rollback: idempotency keys are ephemeral (24h TTL) and have no dependents.

DROP TABLE IF EXISTS "idempotency_keys" CASCADE;
