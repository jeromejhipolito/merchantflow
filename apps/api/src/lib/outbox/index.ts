// =============================================================================
// Transactional Outbox
// =============================================================================
// The outbox guarantees at-least-once delivery of domain events without
// distributed transactions. The flow:
//
// 1. Service layer performs a mutation and writes an OutboxEvent in the SAME
//    database transaction:
//
//    await prisma.$transaction([
//      prisma.order.create({ data: orderData }),
//      outbox.write(tx, { storeId, aggregateType: 'Order', ... }),
//    ]);
//
// 2. A background poller (OutboxPollerWorker) queries for PENDING events:
//    SELECT * FROM outbox_events
//    WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
//    ORDER BY created_at ASC
//    LIMIT 50
//    FOR UPDATE SKIP LOCKED;
//
//    FOR UPDATE SKIP LOCKED prevents multiple pollers from picking the same
//    event, enabling horizontal scaling of workers.
//
// 3. The poller dispatches each event to the appropriate BullMQ queue.
//
// 4. On success, it marks the event as PUBLISHED.
//    On failure, it increments attempts and sets nextRetryAt.
//    After max attempts, it marks the event as FAILED (dead letter).

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

/**
 * Writes an outbox event. Call this inside a Prisma interactive transaction.
 *
 * Usage:
 *   await prisma.$transaction(async (tx) => {
 *     await tx.order.create({ data: ... });
 *     await writeOutboxEvent(tx, {
 *       storeId: store.id,
 *       aggregateType: 'Order',
 *       aggregateId: order.id,
 *       eventType: 'order.created',
 *       payload: { orderId: order.id, shopifyOrderId: '...' },
 *     });
 *   });
 */
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

/**
 * Polls for pending outbox events using FOR UPDATE SKIP LOCKED.
 * Returns events that are ready to be published.
 */
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
  // Raw query for FOR UPDATE SKIP LOCKED — Prisma doesn't support this natively
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

/**
 * Marks an outbox event as published.
 */
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

/**
 * Marks an outbox event as failed with retry scheduling.
 * After MAX_OUTBOX_ATTEMPTS, marks as FAILED (dead letter).
 */
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
