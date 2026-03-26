// =============================================================================
// Saga Module — API Integration Layer
// =============================================================================
// Re-exports the generic saga engine plus the Prisma-specific store adapter.
// Consumer code within the API imports from this module rather than directly
// from @merchantflow/saga-engine, keeping the import paths clean.

// Re-export everything from the generic engine
export {
  SagaOrchestrator,
  generateIdempotencyKey,
  nullLogger,
  SagaExecutionError,
  SagaCompensationError,
} from "@merchantflow/saga-engine";

export type {
  SagaDefinition,
  SagaStepDefinition,
  SagaExecutionResult,
  SagaOutcome,
  SagaLogger,
  SagaStore,
} from "@merchantflow/saga-engine";

// Prisma-specific adapter
export { PrismaSagaStore } from "./prisma-saga-store.js";
