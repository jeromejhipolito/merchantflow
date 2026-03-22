-- Rollback: 20260330000004_create_shipments
-- Drops the shipments table and ShipmentStatus enum.

DROP TABLE IF EXISTS "shipments" CASCADE;
DROP TYPE IF EXISTS "ShipmentStatus";
