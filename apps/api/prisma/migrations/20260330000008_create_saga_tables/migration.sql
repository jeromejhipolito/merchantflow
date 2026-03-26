-- =============================================================================
-- Migration: Create Saga Orchestration Tables
-- =============================================================================
-- Adds SagaInstance and SagaStep tables for the orchestration-based saga
-- pattern. These tables are the durable source of truth for multi-step
-- async workflows.
--
-- Design decisions:
-- 1. saga_instances.idempotency_key is UNIQUE — prevents duplicate sagas
--    for the same trigger event (e.g., duplicate Shopify webhooks).
-- 2. saga_steps.idempotency_key is UNIQUE — prevents duplicate step
--    execution within a saga. sha256(sagaId + stepName).
-- 3. CASCADE on saga_steps FK — deleting a saga instance removes its steps.
--    In practice, we soft-archive rather than delete.
-- 4. Indexes target the orchestrator's hot queries:
--    - Find saga by idempotency key (dedup check)
--    - Find running sagas by type (monitoring/admin)
--    - Find steps by saga ID ordered by index (sequential execution)

-- Enums
CREATE TYPE "SagaType" AS ENUM ('ORDER_PROCESSING', 'FULFILLMENT');
CREATE TYPE "SagaStatus" AS ENUM ('RUNNING', 'COMPLETED', 'COMPENSATING', 'COMPENSATED', 'FAILED');
CREATE TYPE "SagaStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'COMPENSATING', 'COMPENSATED', 'SKIPPED');

-- Saga Instances
CREATE TABLE "saga_instances" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "type"            "SagaType" NOT NULL,
    "status"          "SagaStatus" NOT NULL DEFAULT 'RUNNING',
    "store_id"        UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "input"           JSONB NOT NULL DEFAULT '{}',
    "output"          JSONB,
    "error"           TEXT,
    "started_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"    TIMESTAMP(3),

    CONSTRAINT "saga_instances_pkey" PRIMARY KEY ("id")
);

-- Saga Steps
CREATE TABLE "saga_steps" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "saga_id"         UUID NOT NULL,
    "step_name"       TEXT NOT NULL,
    "step_index"      INTEGER NOT NULL,
    "status"          "SagaStepStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "input"           JSONB,
    "output"          JSONB,
    "error"           TEXT,
    "attempts"        INTEGER NOT NULL DEFAULT 0,
    "started_at"      TIMESTAMP(3),
    "completed_at"    TIMESTAMP(3),

    CONSTRAINT "saga_steps_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (idempotency)
CREATE UNIQUE INDEX "saga_instances_idempotency_key_key" ON "saga_instances"("idempotency_key");
CREATE UNIQUE INDEX "saga_steps_idempotency_key_key" ON "saga_steps"("idempotency_key");

-- Performance indexes for saga_instances
CREATE INDEX "saga_instances_store_id_type_idx" ON "saga_instances"("store_id", "type");
CREATE INDEX "saga_instances_status_idx" ON "saga_instances"("status");
CREATE INDEX "saga_instances_type_status_idx" ON "saga_instances"("type", "status");
CREATE INDEX "saga_instances_store_id_idempotency_key_idx" ON "saga_instances"("store_id", "idempotency_key");

-- Performance indexes for saga_steps
CREATE INDEX "saga_steps_saga_id_step_index_idx" ON "saga_steps"("saga_id", "step_index");
CREATE INDEX "saga_steps_saga_id_status_idx" ON "saga_steps"("saga_id", "status");

-- Foreign keys
ALTER TABLE "saga_steps"
    ADD CONSTRAINT "saga_steps_saga_id_fkey"
    FOREIGN KEY ("saga_id") REFERENCES "saga_instances"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
