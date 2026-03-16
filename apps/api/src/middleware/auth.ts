// =============================================================================
// Authentication Middleware
// =============================================================================
// Two authentication strategies:
//
// 1. API Key Authentication (for merchant API access)
//    Header: Authorization: Bearer <api-key>
//    The API key maps to a store. All subsequent queries are scoped to that store.
//
// 2. Shopify Session Token (for embedded app frontend)
//    Header: Authorization: Bearer <shopify-session-token>
//    Verified using Shopify's session token mechanism.
//
// For this portfolio project, we implement API key auth. The session token
// strategy would follow the same middleware pattern with Shopify JWT verification.

import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { AppError, ErrorCode } from "../lib/errors/index.js";

/**
 * Registers the auth decorator and preHandler hook.
 *
 * After this middleware runs, the request has:
 *   request.storeId  — the authenticated store's UUID
 *   request.store    — the full store object (lazy-loaded on first access)
 */
export function registerAuthMiddleware(
  app: FastifyInstance,
  prisma: PrismaClient
): void {
  // Decorate request with storeId (typed via module augmentation in types/)
  app.decorateRequest("storeId", "");

  app.addHook("preHandler", async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip auth for health checks and Shopify webhooks (they use HMAC auth)
    const publicPaths = [
      "/health",
      "/webhooks/shopify",
      "/auth/shopify",
      "/auth/shopify/callback",
    ];
    if (publicPaths.some((p) => request.url.startsWith(p))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Missing or invalid Authorization header. Expected: Bearer <api-key>",
      });
    }

    const apiKey = authHeader.slice(7); // strip "Bearer "
    if (!apiKey) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "API key is empty.",
      });
    }

    // Look up store by API key
    // In production, API keys would be stored in a separate table with
    // hashed values, scopes, and expiration. For this project, we use
    // the store ID directly as the API key for simplicity.
    const store = await prisma.store.findUnique({
      where: { id: apiKey },
    });

    if (!store || store.deletedAt) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid API key.",
      });
    }

    if (store.status === "SUSPENDED") {
      throw new AppError({
        code: ErrorCode.STORE_SUSPENDED,
        message: "This store is suspended. Contact support.",
      });
    }

    if (store.status === "UNINSTALLED") {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "This store has been uninstalled.",
      });
    }

    request.storeId = store.id;
  });
}
