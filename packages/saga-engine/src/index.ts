// =============================================================================
// @merchantflow/saga-engine — Public API
// =============================================================================
// A framework-agnostic orchestration-based saga engine for multi-step
// async workflows with compensating transactions.
//
// Usage:
//   import {
//     SagaOrchestrator,
//     generateIdempotencyKey,
//     type SagaDefinition,
//     type SagaStore,
//   } from '@merchantflow/saga-engine';
//
//   const store = new PrismaSagaStore(prisma); // your implementation
//   const orchestrator = new SagaOrchestrator(store, logger);
//   const result = await orchestrator.execute(definition, context, key, storeId);

// Core orchestrator
export { SagaOrchestrator, generateIdempotencyKey } from "./orchestrator.js";

// Types
export type {
  SagaDefinition,
  SagaStepDefinition,
  SagaExecutionResult,
  SagaOutcome,
  SagaLogger,
  SagaStore,
  SagaInstanceRecord,
  SagaStepRecord,
  SagaStatus,
  SagaStepStatus,
} from "./types.js";

export { nullLogger } from "./types.js";

// Errors
export { SagaExecutionError, SagaCompensationError } from "./errors.js";
