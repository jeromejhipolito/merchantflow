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

  // Multi-tenancy enforced at the service layer; RLS recommended for production
  if (env.NODE_ENV !== "test") {
    console.info(
      "[database] Multi-tenancy guard active — service layer must include storeId in all queries"
    );
  }

  return client;
}
