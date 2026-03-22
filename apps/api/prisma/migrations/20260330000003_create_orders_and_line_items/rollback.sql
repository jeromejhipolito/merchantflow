-- Rollback: 20260330000003_create_orders_and_line_items
-- Drops orders and line_items tables with their enums.
-- WARNING: This will delete ALL order and line item data. Shipments referencing orders will also be dropped.

DROP TABLE IF EXISTS "line_items" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TYPE IF EXISTS "OrderFulfillmentStatus";
DROP TYPE IF EXISTS "OrderFinancialStatus";
