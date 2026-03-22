-- Rollback: 20260330000002_create_products
-- Drops the products table and ProductStatus enum.
-- WARNING: This will delete ALL product data. Line items referencing products will have product_id set to NULL.

DROP TABLE IF EXISTS "products" CASCADE;
DROP TYPE IF EXISTS "ProductStatus";
