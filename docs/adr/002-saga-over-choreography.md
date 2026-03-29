# ADR-002: Saga Orchestration over Event Choreography

## Status
Accepted

## Context
Order processing and fulfillment involve multiple steps that must happen in sequence, with rollback capability when a step fails. Two patterns exist for coordinating these steps:

1. **Choreography** — Each service listens for events and reacts independently. No central coordinator. Works well for 2-3 loosely coupled services, but becomes impossible to debug when you have 4+ steps with compensating transactions. Tracing a failed order through event logs across services is painful.

2. **Orchestration** — A central saga coordinator executes steps sequentially, tracks state, and runs compensating transactions in reverse order on failure. Easier to reason about, debug, and test. The tradeoff is a single coordination point.

## Decision
Use orchestration-based sagas. The saga engine is published as a standalone npm package ([saga-engine-ts](https://www.npmjs.com/package/saga-engine-ts)) with zero framework dependencies. MerchantFlow provides a Prisma-backed `SagaStore` implementation.

Key properties:
- **Step-level idempotency**: Each step gets a unique key (`sha256(sagaId + stepName)`). Re-executing a saga after a crash skips completed steps.
- **Saga-level idempotency**: Same webhook produces the same saga key. Duplicate webhooks don't create duplicate sagas.
- **Compensating transactions**: On failure, the orchestrator runs `compensate()` on completed steps in reverse order.
- **Durable state**: Saga instances and steps are stored in PostgreSQL, surviving process restarts.

## Consequences
- Single place to see the state of any multi-step workflow (query `saga_instances`)
- Failed sagas can be manually retried or investigated via the database
- The saga engine is reusable across projects (zero-dependency npm package)
- Slight overhead per saga from database writes for step tracking
- Compensation is best-effort — if a compensating transaction fails, the saga is marked FAILED for manual intervention
