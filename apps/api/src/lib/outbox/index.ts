// Transactional outbox for at-least-once event delivery

import type { PrismaClient, Prisma } from "@prisma/client";
import { calculateNextRetryAt } from "../retry/index.js";

export interface OutboxEventInput {
  storeId: string;
  aggregateType: string; // "Order", "Product", "Shipment"
  aggregateId: string;
  eventType: string; // "order.created", "shipment.shipped"
  payload: Record<string, unknown>;
}

const MAX_OUTBOX_ATTEMPTS = 5;

export async function writeOutboxEvent(
  tx: Prisma.TransactionClient,
  input: OutboxEventInput
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      storeId: input.storeId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });
}

export async function pollOutboxEvents(
  prisma: PrismaClient,
  batchSize: number
): Promise<
  Array<{
    id: string;
    storeId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Prisma.JsonValue;
    attempts: number;
  }>
> {
  // Prisma doesn't support FOR UPDATE SKIP LOCKED natively
  const events = await prisma.$queryRaw<
    Array<{
      id: string;
      store_id: string;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Prisma.JsonValue;
      attempts: number;
    }>
  >`
    SELECT id, store_id, aggregate_type, aggregate_id, event_type, payload, attempts
    FROM outbox_events
    WHERE status = 'PENDING'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `;

  return events.map((e) => ({
    id: e.id,
    storeId: e.store_id,
    aggregateType: e.aggregate_type,
    aggregateId: e.aggregate_id,
    eventType: e.event_type,
    payload: e.payload,
    attempts: e.attempts,
  }));
}

export async function markOutboxEventPublished(
  prisma: PrismaClient,
  eventId: string
): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

export async function markOutboxEventFailed(
  prisma: PrismaClient,
  eventId: string,
  error: string,
  currentAttempts: number
): Promise<void> {
  const newAttempts = currentAttempts + 1;
  const isFinalFailure = newAttempts >= MAX_OUTBOX_ATTEMPTS;

  await prisma.outboxEvent.update({
    where: { id: eventId },
    data: {
      attempts: newAttempts,
      lastError: error,
      ...(isFinalFailure
        ? { status: "FAILED" }
        : { nextRetryAt: calculateNextRetryAt(newAttempts, 2000, 60_000) }),
    },
  });
}
