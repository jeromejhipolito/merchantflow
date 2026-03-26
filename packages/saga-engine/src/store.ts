// =============================================================================
// Saga Store
// =============================================================================
// Re-exports the SagaStore interface and related types from types.ts.
// This file exists so consumers can import `SagaStore` from a semantically
// clear path: `@merchantflow/saga-engine/store`
//
// The actual implementation (e.g., PrismaSagaStore) lives in the consumer's
// codebase, not in this package. This keeps the saga engine database-agnostic.

export type {
  SagaStore,
  SagaInstanceRecord,
  SagaStepRecord,
  SagaStatus,
  SagaStepStatus,
} from "./types.js";
