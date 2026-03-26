// =============================================================================
// Saga Type Definitions
// =============================================================================
// Generic type system for the orchestration-based saga pattern.
// These types are framework-agnostic — no dependency on Prisma, Fastify, or
// any specific database. The persistence layer is abstracted via SagaStore.
//
// Architecture:
//   SagaDefinition<TContext> — declares the steps for a saga type
//   SagaStepDefinition<TContext> — a single step with execute + compensate
//   SagaStore — persistence interface (implemented by consumers)
//   SagaExecutionResult<TContext> — the outcome of running a saga
//
// The context object (TContext) flows through all steps. Each step receives
// the accumulated context and returns a partial update. This means:
// - Steps are loosely coupled (they read from context, not from each other)
// - The orchestrator merges partial outputs into the running context
// - Compensating transactions receive the full context at the time of failure

// ---------------------------------------------------------------------------
// Saga Status Enums (mirrored from DB, but defined here to stay DB-agnostic)
// ---------------------------------------------------------------------------

export type SagaStatus =
  | "RUNNING"
  | "COMPLETED"
  | "COMPENSATING"
  | "COMPENSATED"
  | "FAILED";

export type SagaStepStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "COMPENSATING"
  | "COMPENSATED"
  | "SKIPPED";

// ---------------------------------------------------------------------------
// Core Saga Types
// ---------------------------------------------------------------------------

/**
 * A single step in a saga definition.
 *
 * - `execute` runs the forward action. It receives the accumulated context
 *   and returns a partial context update that gets merged.
 *
 * - `compensate` runs the backward action when a later step fails.
 *   It receives the full context as it existed after this step completed.
 *   Optional — some steps have no side effects to undo.
 *
 * - `maxRetries` controls how many times the orchestrator retries this
 *   specific step before giving up and triggering compensation. Default: 3.
 */
export interface SagaStepDefinition<TContext extends Record<string, unknown>> {
  /** Human-readable step name. Used in logs, DB records, and idempotency keys. */
  name: string;

  /**
   * Forward execution. Must be idempotent — the orchestrator may call this
   * multiple times if the process crashes mid-step.
   *
   * @param context - Accumulated context from all previous steps
   * @returns Partial context update to merge into the running context
   */
  execute: (context: TContext) => Promise<Partial<TContext>>;

  /**
   * Compensating transaction. Undoes the side effects of `execute`.
   * Called during compensation in reverse order of completed steps.
   *
   * @param context - Full context as it existed after this step completed
   */
  compensate?: (context: TContext) => Promise<void>;

  /**
   * Maximum retry attempts for this step before triggering compensation.
   * Default: 3. Set to 1 for steps that should not be retried (e.g.,
   * external API calls that are not idempotent).
   */
  maxRetries?: number;
}

/**
 * A saga definition declares the type and ordered steps for a workflow.
 *
 * Steps execute sequentially in array order. If any step fails after
 * exhausting retries, compensation runs in reverse order starting from
 * the last completed step.
 */
export interface SagaDefinition<TContext extends Record<string, unknown>> {
  /** Saga type identifier. Maps to the SagaType enum in the DB. */
  type: string;

  /** Ordered list of steps. Executed sequentially, compensated in reverse. */
  steps: SagaStepDefinition<TContext>[];
}

// ---------------------------------------------------------------------------
// Execution Result
// ---------------------------------------------------------------------------

export type SagaOutcome = "COMPLETED" | "COMPENSATED" | "FAILED";

/**
 * The result returned by the saga orchestrator after execution.
 */
export interface SagaExecutionResult<TContext extends Record<string, unknown>> {
  /** The saga instance ID. */
  sagaId: string;

  /** Final outcome of the saga. */
  outcome: SagaOutcome;

  /** The final accumulated context after all steps (or the last successful step). */
  context: TContext;

  /** Error message if the saga failed or was compensated. */
  error?: string;

  /** Whether this result was returned from cache (saga already completed). */
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Persistence Abstraction — SagaStore
// ---------------------------------------------------------------------------

/** Persisted saga instance record. */
export interface SagaInstanceRecord {
  id: string;
  type: string;
  status: SagaStatus;
  storeId: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

/** Persisted saga step record. */
export interface SagaStepRecord {
  id: string;
  sagaId: string;
  stepName: string;
  stepIndex: number;
  status: SagaStepStatus;
  idempotencyKey: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Persistence interface for saga state.
 *
 * The saga engine is database-agnostic — it communicates with the database
 * exclusively through this interface. Consumers implement it with their
 * ORM of choice (Prisma, Drizzle, Knex, raw SQL, etc.).
 *
 * All methods must be atomic. The store is responsible for transactions
 * where needed.
 */
export interface SagaStore {
  // --- Saga Instance Operations ---

  /** Find a saga instance by its idempotency key. Returns null if not found. */
  findSagaByIdempotencyKey(
    idempotencyKey: string
  ): Promise<(SagaInstanceRecord & { steps: SagaStepRecord[] }) | null>;

  /** Create a saga instance with its step records atomically. */
  createSaga(params: {
    type: string;
    status: SagaStatus;
    storeId: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
    steps: Array<{
      stepName: string;
      stepIndex: number;
      idempotencyKey: string;
    }>;
  }): Promise<SagaInstanceRecord & { steps: SagaStepRecord[] }>;

  /** Update a saga instance's status and optional fields. */
  updateSaga(
    sagaId: string,
    data: Partial<
      Pick<SagaInstanceRecord, "status" | "output" | "error" | "completedAt">
    >
  ): Promise<void>;

  // --- Step Operations ---

  /** Find a step record by saga ID and step index. */
  findStep(
    sagaId: string,
    stepIndex: number
  ): Promise<SagaStepRecord | null>;

  /** Update a step record. */
  updateStep(
    stepId: string,
    data: Partial<
      Pick<
        SagaStepRecord,
        "status" | "input" | "output" | "error" | "attempts" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Logger Interface
// ---------------------------------------------------------------------------

/**
 * Structured logger interface for saga observability.
 * Matches pino's child-logger API shape so it works with Fastify out of the box.
 */
export interface SagaLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * No-op logger for testing or when logging is not needed.
 */
export const nullLogger: SagaLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
