# MerchantFlow — Backend Architecture

Cross-border e-commerce operations platform. Demonstrates production backend
patterns for Shopify integration, reliable event delivery, and multi-tenant
data isolation.

**Stack:** Fastify + Prisma + PostgreSQL + BullMQ + Redis + TypeScript

---

## 1. Module Structure

```
src/
├── config/                     # Environment, database, Redis setup
│   ├── env.ts                  # 12-Factor env validation (fail fast)
│   ├── database.ts             # Prisma client + multi-tenancy middleware
│   └── redis.ts                # Shared Redis connection
│
├── lib/                        # Framework-agnostic utilities
│   ├── errors/index.ts         # AppError hierarchy + error code catalog
│   ├── retry/index.ts          # Exponential backoff + full jitter
│   ├── idempotency/index.ts    # Idempotency key middleware
│   ├── outbox/index.ts         # Transactional outbox write + poll + ack
│   ├── hmac/index.ts           # HMAC sign/verify (inbound + outbound)
│   ├── pagination/index.ts     # Cursor pagination helpers
│   └── shopify/
│       ├── client.ts           # Shopify REST API client with retry
│       └── oauth.ts            # OAuth flow + token encryption
│
├── modules/                    # Domain modules (DDD bounded contexts)
│   ├── store/
│   │   └── store.service.ts    # Store aggregate: install, uninstall
│   ├── order/
│   │   └── order.service.ts    # Order aggregate: sync, list, get
│   ├── shipment/
│   │   └── shipment.service.ts # Shipment aggregate: create, state machine
│   └── webhook/
│       ├── webhook.service.ts           # Outbound webhook delivery
│       └── shopify-webhook.handler.ts   # Inbound Shopify webhook pipeline
│
├── workers/                    # BullMQ workers + outbox poller
│   ├── queues.ts               # Queue definitions and creation
│   ├── order-sync.worker.ts    # Process Shopify order webhooks
│   ├── label-generation.worker.ts  # Generate shipping labels
│   └── outbox-poller.worker.ts     # Poll outbox -> dispatch to queues
│
├── routes/                     # Fastify route handlers (thin controllers)
│   ├── index.ts                # Route registration tree
│   ├── health.routes.ts        # GET /health, GET /health/ready
│   ├── auth.routes.ts          # Shopify OAuth flow
│   ├── shopify-webhook.routes.ts  # POST /webhooks/shopify
│   ├── order.routes.ts         # Order CRUD
│   ├── shipment.routes.ts      # Shipment operations
│   └── webhook.routes.ts       # Webhook endpoint management
│
├── middleware/
│   ├── auth.ts                 # API key authentication + store resolution
│   └── error-handler.ts        # Global error -> HTTP response mapping
│
└── server.ts                   # Bootstrap: wire everything, start, shutdown
```

### Layering Rules

```
Routes (thin) -> Services (business logic) -> Prisma (data access)
                      |
                      v
                 Outbox Events -> Poller -> BullMQ Queues -> Workers
```

- **Routes** handle HTTP concerns: parse input, call service, format response.
  No business logic. No direct Prisma calls.
- **Services** own domain logic, enforce invariants, and write outbox events
  atomically with mutations. Services never call BullMQ directly — the outbox
  decouples them from the queue system.
- **Workers** process background jobs. They can call services but not routes.
- **Lib** modules are pure utilities with zero domain knowledge.

---

## 2. API Route Catalog

### Public (No Auth)

| Method | Path                       | Purpose                        | Response |
|--------|----------------------------|--------------------------------|----------|
| GET    | /health                    | Liveness check                 | 200      |
| GET    | /health/ready              | Readiness check (DB + Redis)   | 200/503  |
| GET    | /auth/shopify              | Initiate Shopify OAuth         | 302      |
| GET    | /auth/shopify/callback     | Handle OAuth callback          | 302      |
| POST   | /webhooks/shopify          | Receive Shopify webhooks       | 200      |

### Authenticated (Bearer API Key + Idempotency-Key on writes)

| Method | Path                                    | Purpose                      | Response |
|--------|-----------------------------------------|------------------------------|----------|
| GET    | /api/v1/orders                          | List orders (paginated)      | 200      |
| GET    | /api/v1/orders/:orderId                 | Get order + line items       | 200      |
| POST   | /api/v1/orders/:orderId/shipments       | Create shipment              | 202      |
| GET    | /api/v1/orders/:orderId/shipments       | List shipments for order     | 200      |
| GET    | /api/v1/shipments/:shipmentId           | Get shipment details         | 200      |
| POST   | /api/v1/shipments/:shipmentId/ship      | Mark shipment as shipped     | 200      |
| POST   | /api/v1/webhooks                        | Register webhook endpoint    | 201      |
| GET    | /api/v1/webhooks                        | List webhook endpoints       | 200      |
| DELETE | /api/v1/webhooks/:endpointId            | Deactivate webhook endpoint  | 200      |

### HTTP Semantics

- **POST returning 202**: Shipment creation returns 202 Accepted because label
  generation is async. The client polls the shipment endpoint.
- **Idempotency-Key**: Required on all POST/PUT/PATCH/DELETE requests. Replayed
  on retry (returns cached response with `Idempotency-Replayed: true` header).
- **Cursor Pagination**: All list endpoints use `?cursor=<uuid>&limit=20`.
  Response includes `{ pagination: { cursor, hasMore } }`.
- **Error Format**: All errors return `{ error: { code, message, details? } }`.

---

## 3. Data Model Design Decisions

### Multi-Tenancy

Every business table includes `storeId` as a non-nullable foreign key.
Prisma middleware rejects any findMany/findFirst/count/aggregate that
omits `storeId` from the WHERE clause. This is a safety net — the
service layer should always scope queries, but the middleware prevents
accidental data leakage.

All composite indexes include `storeId` as the leading column because
every query is store-scoped. Example: `@@index([storeId, fulfillmentStatus])`
ensures that `WHERE storeId = ? AND fulfillmentStatus = ?` uses an index
scan, not a table scan followed by a filter.

### Idempotency Keys

Scoped to `(storeId, key)` — different tenants can use the same key
string. Keys expire after 24 hours (configurable). The response body is
stored as JSONB so replays return the exact same response.

Lock mechanism: `lockedAt` timestamp prevents concurrent processing of
the same key. Stale locks (> 60 seconds) are reclaimed — this handles
the case where the process crashes mid-request.

### Transactional Outbox

Events are written to `outbox_events` in the same DB transaction as the
mutation. The outbox poller uses `FOR UPDATE SKIP LOCKED` to prevent
duplicate processing across multiple poller instances. Events transition
through PENDING -> PUBLISHED (or FAILED after max attempts).

### Why Upsert for Order Sync

Shopify sends `orders/create` and `orders/updated` — both carry the full
order payload. By using upsert keyed on `(storeId, shopifyOrderId)`, we
handle both events with the same code path. This makes the sync idempotent
by design.

### Shipment State Machine

Transitions are validated by a whitelist. You cannot go from DELIVERED
back to PENDING. The `assertValidTransition()` function throws an
INVALID_SHIPMENT_TRANSITION error with the current state, requested state,
and allowed transitions in the error details.

---

## 4. Webhook Pipeline

### Inbound (Shopify -> MerchantFlow)

```
Shopify POST /webhooks/shopify
    │
    ▼
[1] Raw body parser (preserve exact bytes for HMAC)
    │
    ▼
[2] HMAC verification (X-Shopify-Hmac-Sha256 vs SHA-256 of raw body)
    │                  Uses per-store secret, falls back to app secret
    ▼
[3] Deduplication (X-Shopify-Webhook-Id lookup in shopify_webhook_logs)
    │               If exists: return 200, skip processing
    ▼
[4] Log webhook (INSERT into shopify_webhook_logs, status = RECEIVED)
    │
    ▼
[5] Dispatch to BullMQ (topic -> queue name mapping)
    │   Job options: 5 attempts, exponential backoff (2s base)
    │   JobId = webhookId (queue-level deduplication too)
    ▼
[6] Return 200 immediately (Shopify timeout is 5 seconds)
```

**Why respond before processing?** Shopify retries on non-2xx after 5
seconds. If order processing takes 3 seconds and a network blip causes
the response to be lost, Shopify retries and we get a duplicate. By
responding immediately, we acknowledge receipt. If processing fails,
BullMQ retries internally.

### Outbound (MerchantFlow -> Merchant Endpoints)

```
Domain Event (in DB transaction)
    │
    ▼
[1] Write to outbox_events table (same transaction as mutation)
    │
    ▼
[2] Outbox poller picks up PENDING events (FOR UPDATE SKIP LOCKED)
    │
    ▼
[3] Dispatch to "webhook-delivery" BullMQ queue
    │
    ▼
[4] Webhook worker finds matching endpoints (event type + store)
    │
    ▼
[5] For each endpoint:
    ├─ Sign payload with endpoint's HMAC secret
    ├─ POST to URL with retry (3 attempts, exponential backoff)
    ├─ Record delivery in webhook_deliveries table
    └─ On persistent failure: increment endpoint failure_count
       If failure_count >= 10: auto-disable endpoint
```

---

## 5. Background Job Design

### Queue Catalog

| Queue              | Trigger                        | Concurrency | Rate Limit        |
|--------------------|--------------------------------|-------------|-------------------|
| order-sync         | Shopify orders/* webhook       | 5           | 20/10s            |
| product-sync       | Shopify products/* webhook     | 5           | 20/10s            |
| store-lifecycle    | Shopify app/uninstalled        | 1           | None              |
| label-generation   | Shipment created (via outbox)  | 3           | 10/60s            |
| webhook-delivery   | Any domain event (via outbox)  | 10          | None              |
| outbox-publish     | Internal routing               | 5           | None              |
| inventory-sync     | Scheduled (cron)               | 1           | None              |
| cleanup            | Scheduled (cron)               | 1           | None              |

### Failure Handling

```
Attempt 1: immediate
Attempt 2: 2s delay (exponential backoff)
Attempt 3: 4s delay
Attempt 4: 8s delay
Attempt 5: 16s delay (max for most jobs)
```

After all attempts exhausted:
- Job moves to BullMQ's failed set
- ShopifyWebhookLog status set to FAILED with error message
- OutboxEvent status set to FAILED (dead letter)
- WebhookDelivery status set to DEAD

Failed jobs are retained (5000 most recent) for debugging and manual replay.

### Outbox Poller (Not a BullMQ Worker)

The outbox poller is a standalone polling loop, not a BullMQ worker. Why?
It needs to query PostgreSQL with `FOR UPDATE SKIP LOCKED`, which is a
DB-level concern. It runs on a configurable interval (default: 1 second)
and processes events in batches of 50.

---

## 6. Error Handling Strategy

### Error Classification

| Category      | HTTP Status   | Log Level | Example                           |
|---------------|---------------|-----------|-----------------------------------|
| Validation    | 400           | WARN      | Missing required field             |
| Auth          | 401/403       | WARN      | Invalid API key, store suspended   |
| Not Found     | 404           | WARN      | Order not found                    |
| Conflict      | 409           | WARN      | Duplicate webhook, idempotency     |
| Business Rule | 422           | WARN      | Insufficient inventory             |
| Rate Limited  | 429           | WARN      | Shopify API rate limit             |
| Internal      | 500           | ERROR     | Unhandled exception (bug)          |
| External      | 502           | ERROR     | Shopify API down                   |
| Unavailable   | 503           | WARN      | DB connection failed               |

### Response Format

All errors return:
```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found: abc-123",
    "details": { ... },
    "retryAfterSeconds": 30
  }
}
```

### Retry Policies by Context

| Context                | Max Attempts | Base Delay | Max Delay | Strategy      |
|------------------------|-------------|------------|-----------|---------------|
| Shopify API calls      | 3           | 1s         | 15s       | Full jitter   |
| Carrier API calls      | 3           | 2s         | 15s       | Full jitter   |
| Webhook delivery       | 3           | 1s         | 10s       | Full jitter   |
| BullMQ job retry       | 5           | 2s         | 32s       | Exponential   |
| Outbox event publish   | 5           | 2s         | 60s       | Full jitter   |

---

## 7. Key Architecture Decisions

### Why Fastify over Express?
- Native TypeScript support with JSON Schema validation
- 2x throughput over Express in benchmarks
- Plugin system with proper encapsulation
- Built-in request validation and serialization
- First-class support for async/await (no callback confusion)

### Why Prisma over raw SQL / TypeORM?
- Type-safe query builder generated from schema
- Schema-as-code with migration management
- Middleware API for cross-cutting concerns (multi-tenancy guard)
- Interactive transactions for outbox pattern

### Why BullMQ over Agenda / node-cron?
- Redis-backed = durable across process restarts
- Built-in retry with configurable backoff
- Rate limiting per queue
- Job deduplication by jobId
- Repeatable jobs for scheduled tasks
- Dashboard (Bull Board) for monitoring

### Why Outbox Pattern instead of direct BullMQ dispatch?
- If the DB transaction succeeds but Redis is down, the event is lost.
- The outbox writes the event in the SAME DB transaction as the mutation.
- The poller publishes to BullMQ asynchronously.
- Worst case: the event is published twice (at-least-once). The consumer
  must be idempotent (and it is — upsert on unique constraints).

### Why Cursor Pagination over Offset?
- Offset pagination degrades O(n) as page number grows (OFFSET 10000 still
  scans 10000 rows).
- Cursor pagination is O(1) — it seeks to the cursor position via index.
- Stable under concurrent inserts (offset pagination can skip/duplicate rows).
- Mobile-friendly: "load more" pattern, not "page 1 of 50" pattern.
