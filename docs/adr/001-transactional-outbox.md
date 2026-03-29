# ADR-001: Transactional Outbox for Event Delivery

## Status
Accepted

## Context
MerchantFlow needs to publish domain events (order synced, shipment created, etc.) to merchant webhook endpoints and internal queues after mutations. The challenge: how do you guarantee an event is published when the mutation succeeds, without distributed transactions?

Three options were considered:

1. **Direct queue dispatch** — Write to BullMQ after the DB commit. Problem: if Redis is down or the process crashes between the DB commit and the queue write, the event is silently lost. In e-commerce, a lost `order.synced` event means a merchant never knows about a new order.

2. **Change Data Capture (CDC)** — Use Debezium to stream PostgreSQL WAL changes to Kafka. Problem: requires Kafka + Debezium + Zookeeper infrastructure. Operationally heavy for a team of any size, overkill for our throughput.

3. **Transactional Outbox** — Write the event to an `outbox_events` table in the same database transaction as the mutation. A background poller reads pending events and dispatches them to BullMQ.

## Decision
Use the transactional outbox pattern. Events are written atomically with business data using Prisma's `$transaction`. A poller queries with `FOR UPDATE SKIP LOCKED` to enable safe concurrent polling.

## Consequences
- Events survive Redis outages and process crashes — they're in PostgreSQL
- At-least-once delivery: events may be published twice if the poller crashes after dispatch but before marking as PUBLISHED. Consumers must be idempotent (they already are — upsert on unique constraints)
- Small delivery delay proportional to `OUTBOX_POLL_INTERVAL_MS` (default 1s)
- The outbox table needs periodic cleanup of old PUBLISHED events
- No additional infrastructure beyond what we already have (PostgreSQL)
