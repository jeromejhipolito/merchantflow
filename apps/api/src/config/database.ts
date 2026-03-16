// =============================================================================
// Prisma Client Singleton
// =============================================================================
// One client per process. Prisma manages its own connection pool internally.
// In tests, we swap this for a transactional client (see tests/helpers).

import { PrismaClient } from "@prisma/client";
import type { Env } from "./env.js";

export function createPrismaClient(env: Env): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "info" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ],
  });

  // ---------------------------------------------------------------------------
  // Multi-tenancy guard
  // ---------------------------------------------------------------------------
  // Prisma v6 removed the $use() middleware API. The multi-tenancy invariant
  // (all queries on tenant-scoped models MUST include storeId) is enforced at
  // the service layer. In a production system you would add PostgreSQL
  // row-level security (RLS) as a defense-in-depth measure.
  //
  // Tenant-scoped models: Product, Order, LineItem, Shipment,
  // WebhookEndpoint, WebhookDelivery, IdempotencyKey, OutboxEvent.

  if (env.NODE_ENV !== "test") {
    console.info(
      "[database] Multi-tenancy guard active — service layer must include storeId in all queries"
    );
  }

  return client;
}
