import { createHash } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { AppError, ErrorCode } from "../errors/index.js";

export interface IdempotencyConfig {
  ttlHours: number; // how long keys are valid
}

export function hashRequestBody(body: unknown): string {
  const serialized = JSON.stringify(body ?? {});
  return createHash("sha256").update(serialized).digest("hex");
}

export function createIdempotencyHook(
  prisma: PrismaClient,
  config: IdempotencyConfig
) {
  return async function idempotencyHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const method = request.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return;
    }

    const path = request.url.split("?")[0] ?? "";
    if (
      path.startsWith("/webhooks/") ||
      path.startsWith("/health") ||
      path.startsWith("/auth/")
    ) {
      return;
    }

    const idempotencyKey = request.headers["idempotency-key"] as
      | string
      | undefined;

    if (!idempotencyKey) {
      throw new AppError({
        code: ErrorCode.INVALID_IDEMPOTENCY_KEY,
        message:
          "Idempotency-Key header is required for mutating requests. " +
          "Supply a UUID v4 to ensure safe retries.",
      });
    }

    if (!/^[a-f0-9-]{36}$/i.test(idempotencyKey)) {
      throw new AppError({
        code: ErrorCode.INVALID_IDEMPOTENCY_KEY,
        message: "Idempotency-Key must be a valid UUID v4.",
      });
    }

    const storeId = request.storeId as string;
    if (!storeId) {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Missing storeId in request context.",
        isOperational: false,
      });
    }

    const requestHash = hashRequestBody(request.body);
    const httpPath = request.url.split("?")[0] ?? request.url;

    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        uq_store_idempotency_key: {
          storeId,
          key: idempotencyKey,
        },
      },
    });

    if (existing) {
      if (existing.completedAt && existing.responseBody !== null) {
        if (existing.requestHash !== requestHash) {
          throw new AppError({
            code: ErrorCode.IDEMPOTENCY_KEY_MISMATCH,
            message:
              "Idempotency-Key was already used with a different request body. " +
              "Each key must be used with the same request parameters.",
          });
        }

        reply
          .status(existing.responseStatus ?? 200)
          .header("Idempotency-Replayed", "true")
          .send(existing.responseBody);
        return;
      }

      if (existing.lockedAt && !existing.completedAt) {
        const lockAge = Date.now() - existing.lockedAt.getTime();
        if (lockAge < 60_000) {
          throw new AppError({
            code: ErrorCode.IDEMPOTENCY_KEY_IN_PROGRESS,
            message:
              "A request with this Idempotency-Key is currently being processed. " +
              "Wait and retry.",
            retryAfterSeconds: 5,
          });
        }

        await prisma.idempotencyKey.update({
          where: { id: existing.id },
          data: { lockedAt: new Date() },
        });
        request.idempotencyKeyId = existing.id;
        return;
      }
    }

    const expiresAt = new Date(
      Date.now() + config.ttlHours * 60 * 60 * 1000
    );

    const created = await prisma.idempotencyKey.create({
      data: {
        storeId,
        key: idempotencyKey,
        httpMethod: method,
        httpPath,
        requestHash,
        lockedAt: new Date(),
        expiresAt,
      },
    });

    request.idempotencyKeyId = created.id;
  };
}

export function createIdempotencyResponseHook(prisma: PrismaClient) {
  return async function idempotencyResponseHook(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: string
  ): Promise<string> {
    const keyId = request.idempotencyKeyId as string | undefined;
    if (!keyId) return payload;

    try {
      const parsedBody = payload ? JSON.parse(payload) : null;
      await prisma.idempotencyKey.update({
        where: { id: keyId },
        data: {
          responseStatus: reply.statusCode,
          responseBody: parsedBody,
          completedAt: new Date(),
          lockedAt: null,
        },
      });
    } catch {
      request.log.error(
        { idempotencyKeyId: keyId },
        "Failed to store idempotency response"
      );
    }

    return payload;
  };
}
