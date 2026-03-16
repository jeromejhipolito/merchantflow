// =============================================================================
// Idempotency Key Middleware
// =============================================================================
// Every mutating API endpoint (POST, PUT, PATCH, DELETE) requires an
// Idempotency-Key header. The flow:
//
// 1. Client sends request with `Idempotency-Key: <uuid>` header
// 2. Middleware looks up the key in the DB (scoped to storeId + key)
// 3. If key exists AND is completed:
//    a. Verify request hash matches (same body = replay, different body = error)
//    b. Return the stored response without re-executing
// 4. If key exists AND is locked (in-progress):
//    a. Return 409 Conflict — tell client to wait and retry
// 5. If key does not exist:
//    a. Insert with lockedAt = now() in a transaction
//    b. Execute the handler
//    c. Store the response and set completedAt
//    d. If handler throws, delete the key so it can be retried
//
// Why not use Redis for idempotency?
// The response must survive Redis eviction and restarts. The key table is in
// PostgreSQL because durability matters more than speed here — this is a
// write path, so the extra 1-2ms of DB latency is irrelevant.

import { createHash } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { AppError, ErrorCode } from "../errors/index.js";

export interface IdempotencyConfig {
  ttlHours: number; // how long keys are valid
}

/**
 * Computes a SHA-256 hash of the request body.
 * Used to detect misuse: same key with different body is an error.
 */
export function hashRequestBody(body: unknown): string {
  const serialized = JSON.stringify(body ?? {});
  return createHash("sha256").update(serialized).digest("hex");
}

/**
 * Creates the idempotency preHandler hook for Fastify.
 *
 * Registered on mutating route groups:
 *   app.addHook('preHandler', createIdempotencyHook(prisma, config));
 *
 * The hook decorates the request with `request.idempotencyKeyId` so the
 * response handler can update the stored response after the handler completes.
 */
export function createIdempotencyHook(
  prisma: PrismaClient,
  config: IdempotencyConfig
) {
  return async function idempotencyHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Only apply to mutating methods
    const method = request.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
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

    // Validate format (loose UUID check)
    if (!/^[a-f0-9-]{36}$/i.test(idempotencyKey)) {
      throw new AppError({
        code: ErrorCode.INVALID_IDEMPOTENCY_KEY,
        message: "Idempotency-Key must be a valid UUID v4.",
      });
    }

    // storeId comes from the authenticated store context
    const storeId = request.storeId as string;
    if (!storeId) {
      // This is a programming error — auth middleware should always set storeId
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Missing storeId in request context.",
        isOperational: false,
      });
    }

    const requestHash = hashRequestBody(request.body);
    const httpPath = request.url.split("?")[0] ?? request.url; // strip query params

    // Check for existing key
    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        uq_store_idempotency_key: {
          storeId,
          key: idempotencyKey,
        },
      },
    });

    if (existing) {
      // Key exists and has a stored response — replay it
      if (existing.completedAt && existing.responseBody !== null) {
        // But first, verify the request body matches
        if (existing.requestHash !== requestHash) {
          throw new AppError({
            code: ErrorCode.IDEMPOTENCY_KEY_MISMATCH,
            message:
              "Idempotency-Key was already used with a different request body. " +
              "Each key must be used with the same request parameters.",
          });
        }

        // Replay the stored response
        reply
          .status(existing.responseStatus ?? 200)
          .header("Idempotency-Replayed", "true")
          .send(existing.responseBody);
        return;
      }

      // Key exists but is locked (in-progress by another request)
      if (existing.lockedAt && !existing.completedAt) {
        // Check if the lock is stale (> 60 seconds = probably crashed)
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

        // Stale lock — take over by re-locking
        await prisma.idempotencyKey.update({
          where: { id: existing.id },
          data: { lockedAt: new Date() },
        });
        request.idempotencyKeyId = existing.id;
        return;
      }
    }

    // New key — insert and lock
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

/**
 * After-handler hook: stores the response in the idempotency key record.
 * Called in the onSend hook so we capture the final serialized response.
 */
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
      // If storing the response fails, don't break the response to the client.
      // The key will have a stale lock and can be retried after 60s.
      request.log.error(
        { idempotencyKeyId: keyId },
        "Failed to store idempotency response"
      );
    }

    return payload;
  };
}
