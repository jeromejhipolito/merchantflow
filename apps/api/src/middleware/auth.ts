import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { AppError, ErrorCode } from "../lib/errors/index.js";

export function registerAuthMiddleware(
  app: FastifyInstance,
  prisma: PrismaClient
): void {
  app.decorateRequest("storeId", "");

  app.addHook("preHandler", async (request: FastifyRequest, _reply: FastifyReply) => {
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

    const apiKey = authHeader.slice(7);
    if (!apiKey) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "API key is empty.",
      });
    }

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
