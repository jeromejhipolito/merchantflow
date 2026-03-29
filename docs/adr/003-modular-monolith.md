# ADR-003: Modular Monolith over Microservices

## Status
Accepted

## Context
MerchantFlow has distinct domain areas: orders, shipments, stores, webhooks, inventory. The question is whether to build them as separate microservices or as modules within a single deployable unit.

Microservices would give us independent deployment and scaling per domain. But they also add: network calls between services, distributed transaction complexity, per-service CI/CD pipelines, service discovery, and operational overhead that doesn't pay off at our scale.

## Decision
Build a modular monolith with clear domain boundaries enforced by directory structure (`modules/order`, `modules/shipment`, `modules/store`, `modules/webhook`). The BullMQ worker runs as a separate process from the API server, demonstrating that process-level isolation is possible without full service decomposition.

Layering rules:
- Routes call services, never other routes
- Services own domain logic and write outbox events atomically
- Services never call BullMQ directly — the outbox decouples them from the queue
- Workers can call services but not routes
- Lib modules have zero domain knowledge

## Consequences
- Single database, single deployment, simple operations
- Domain boundaries are enforced by convention (directory structure), not by network
- The outbox pattern already provides the decoupling benefit of a message broker without the infrastructure
- Migration path: if a module needs independent scaling, extract it into its own service. The outbox events already define the contract boundary.
- Worker process can scale independently (run N worker replicas with 1 API server)
- Risk: discipline required to not let modules reach into each other's internals. Code review catches this.
