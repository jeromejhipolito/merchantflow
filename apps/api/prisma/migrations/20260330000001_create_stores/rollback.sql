-- Rollback: 20260330000001_create_stores
-- Drops the stores table and StoreStatus enum.
-- WARNING: This will delete ALL store data and cascade to dependent tables.

DROP TABLE IF EXISTS "stores" CASCADE;
DROP TYPE IF EXISTS "StoreStatus";
-- Note: pgcrypto extension is intentionally NOT dropped as other schemas may use it.
