// =============================================================================
// Saga Error Types
// =============================================================================
// Typed errors for the saga engine. These allow consumers to distinguish
// between execution failures (a step's forward action failed) and
// compensation failures (a step's undo action failed) — which have very
// different operational implications.

/**
 * Thrown when a saga step's forward execution fails after all retries.
 * The saga engine will initiate compensation when this occurs.
 */
export class SagaExecutionError extends Error {
  public readonly sagaId: string;
  public readonly stepName: string;
  public readonly stepIndex: number;
  public readonly attempts: number;

  constructor(params: {
    sagaId: string;
    stepName: string;
    stepIndex: number;
    attempts: number;
    message: string;
    cause?: Error;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "SagaExecutionError";
    this.sagaId = params.sagaId;
    this.stepName = params.stepName;
    this.stepIndex = params.stepIndex;
    this.attempts = params.attempts;
  }
}

/**
 * Thrown when one or more compensating transactions fail.
 * This is a critical error — it means the system is in an inconsistent
 * state and requires manual intervention.
 */
export class SagaCompensationError extends Error {
  public readonly sagaId: string;
  public readonly failedCompensations: Array<{
    stepName: string;
    stepIndex: number;
    error: string;
  }>;

  constructor(params: {
    sagaId: string;
    failedCompensations: Array<{
      stepName: string;
      stepIndex: number;
      error: string;
    }>;
    message: string;
  }) {
    super(params.message);
    this.name = "SagaCompensationError";
    this.sagaId = params.sagaId;
    this.failedCompensations = params.failedCompensations;
  }
}
