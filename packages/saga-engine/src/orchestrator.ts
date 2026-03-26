// =============================================================================
// Saga Orchestrator
// =============================================================================
// The central coordinator for multi-step async workflows with compensating
// transactions. This is the ORCHESTRATION pattern (not choreography).
//
// This module is framework-agnostic. It depends only on:
// - SagaStore (persistence interface — implemented by consumers)
// - SagaDefinition (step definitions provided by consumers)
// - SagaLogger (structured logging — optional, defaults to no-op)
//
// Execution model:
// 1. Create a SagaInstance record (or find existing via idempotency key)
// 2. Create SagaStep records for each step in the definition
// 3. Execute steps sequentially:
//    a. Check idempotency — if step is COMPLETED, skip and use cached output
//    b. Mark step as RUNNING, execute the forward action
//    c. On success: mark COMPLETED, merge output into context, advance
//    d. On failure: retry up to maxRetries, then trigger compensation
// 4. On compensation:
//    a. Mark saga as COMPENSATING
//    b. Walk completed steps in reverse order
//    c. Execute each step's compensate() function
//    d. Mark saga as COMPENSATED (or FAILED if compensation also fails)
//
// Idempotency guarantees:
// - Saga-level: same idempotency key -> return cached result if terminal
// - Step-level: sha256(sagaId + stepName) -> skip if step already COMPLETED
//
// Durability guarantees:
// - All state transitions are persisted to the store before proceeding
// - If the process crashes, the saga can be resumed by re-running with the
//   same idempotency key — completed steps will be skipped

import { createHash } from "node:crypto";
import type {
  SagaDefinition,
  SagaExecutionResult,
  SagaLogger,
  SagaStore,
  SagaInstanceRecord,
  SagaStepRecord,
} from "./types.js";
import { nullLogger } from "./types.js";
import { SagaExecutionError, SagaCompensationError } from "./errors.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Hash Utilities
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic idempotency key by hashing the input parts.
 * Used for both saga-level and step-level idempotency.
 *
 * @example
 * // Saga-level: unique per webhook trigger
 * generateIdempotencyKey(storeId, shopifyOrderId, topic)
 *
 * @example
 * // Step-level: unique per step within a saga
 * generateIdempotencyKey(sagaInstanceId, stepName)
 */
export function generateIdempotencyKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class SagaOrchestrator {
  private readonly store: SagaStore;
  private readonly logger: SagaLogger;

  constructor(store: SagaStore, logger: SagaLogger = nullLogger) {
    this.store = store;
    this.logger = logger;
  }

  /**
   * Executes a saga definition with the given initial context.
   *
   * This is the main entry point. It handles:
   * - Saga-level idempotency (returns cached result if already terminal)
   * - Step creation, sequential execution, and context accumulation
   * - Retry logic per step
   * - Compensation on failure
   *
   * @param definition - The saga definition (type + steps)
   * @param initialContext - The starting context (e.g., webhook payload)
   * @param idempotencyKey - Pre-computed idempotency key for the saga
   * @param storeId - Tenant scope
   * @returns The execution result with final context and outcome
   */
  async execute<TContext extends Record<string, unknown>>(
    definition: SagaDefinition<TContext>,
    initialContext: TContext,
    idempotencyKey: string,
    storeId: string
  ): Promise<SagaExecutionResult<TContext>> {
    // -----------------------------------------------------------------------
    // Phase 1: Saga-level idempotency check
    // -----------------------------------------------------------------------
    const existing = await this.store.findSagaByIdempotencyKey(idempotencyKey);

    if (existing) {
      return this.handleExistingSaga<TContext>(existing, definition);
    }

    // -----------------------------------------------------------------------
    // Phase 2: Create saga instance and step records atomically
    // -----------------------------------------------------------------------
    const sagaInstance = await this.store.createSaga({
      type: definition.type,
      status: "RUNNING",
      storeId,
      idempotencyKey,
      input: initialContext as Record<string, unknown>,
      steps: definition.steps.map((step, index) => ({
        stepName: step.name,
        stepIndex: index,
        // Step idempotency key uses the saga's idempotency key as surrogate
        // since we don't have the saga ID yet at creation time.
        idempotencyKey: generateIdempotencyKey(idempotencyKey, step.name),
      })),
    });

    this.logger.info(
      {
        sagaId: sagaInstance.id,
        sagaType: definition.type,
        storeId,
        stepCount: definition.steps.length,
      },
      "Saga started"
    );

    // -----------------------------------------------------------------------
    // Phase 3: Execute steps sequentially
    // -----------------------------------------------------------------------
    return this.executeSteps(
      sagaInstance.id,
      definition,
      initialContext,
      sagaInstance.steps
    );
  }

  // =========================================================================
  // Private: Handle existing saga (resume or return cached)
  // =========================================================================

  private async handleExistingSaga<TContext extends Record<string, unknown>>(
    existing: SagaInstanceRecord & { steps: SagaStepRecord[] },
    definition: SagaDefinition<TContext>
  ): Promise<SagaExecutionResult<TContext>> {
    // If the saga reached a terminal state, return the cached result
    if (
      existing.status === "COMPLETED" ||
      existing.status === "COMPENSATED" ||
      existing.status === "FAILED"
    ) {
      this.logger.info(
        {
          sagaId: existing.id,
          status: existing.status,
          sagaType: definition.type,
        },
        "Saga already terminal — returning cached result"
      );

      return {
        sagaId: existing.id,
        outcome:
          existing.status === "COMPLETED"
            ? "COMPLETED"
            : existing.status === "COMPENSATED"
              ? "COMPENSATED"
              : "FAILED",
        context: (existing.output ?? {}) as TContext,
        error: existing.error ?? undefined,
        cached: true,
      };
    }

    // Saga is still RUNNING or COMPENSATING — a previous execution crashed.
    // Resume by re-executing. Completed steps will be skipped via idempotency.
    this.logger.warn(
      { sagaId: existing.id, status: existing.status },
      "Resuming in-progress saga"
    );

    // Rebuild the initial context from the persisted input
    const initialContext = existing.input as TContext;

    return this.executeSteps(
      existing.id,
      definition,
      initialContext,
      existing.steps
    );
  }

  // =========================================================================
  // Private: Sequential step execution
  // =========================================================================

  private async executeSteps<TContext extends Record<string, unknown>>(
    sagaId: string,
    definition: SagaDefinition<TContext>,
    initialContext: TContext,
    stepRecords: SagaStepRecord[]
  ): Promise<SagaExecutionResult<TContext>> {
    let context = { ...initialContext };
    const completedStepIndexes: number[] = [];

    for (let i = 0; i < definition.steps.length; i++) {
      const stepDef = definition.steps[i]!;
      const stepRecord = stepRecords.find((s) => s.stepIndex === i);

      if (!stepRecord) {
        throw new Error(
          `Saga step record missing for index ${i} in saga ${sagaId}. ` +
            `This indicates a data corruption issue.`
        );
      }

      // ----- Step-level idempotency: skip completed steps -----
      if (stepRecord.status === "COMPLETED") {
        this.logger.info(
          { sagaId, step: stepDef.name, stepIndex: i },
          "Step already completed — skipping"
        );

        if (stepRecord.output) {
          context = { ...context, ...(stepRecord.output as Partial<TContext>) };
        }
        completedStepIndexes.push(i);
        continue;
      }

      // ----- Execute the step with retries -----
      const maxRetries = stepDef.maxRetries ?? DEFAULT_MAX_RETRIES;
      let stepSucceeded = false;
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.runStep(
            sagaId,
            stepRecord.id,
            stepDef.name,
            i,
            attempt,
            context,
            stepDef.execute
          );

          // Merge step output into running context
          context = { ...context, ...result };
          completedStepIndexes.push(i);
          stepSucceeded = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          this.logger.warn(
            {
              sagaId,
              step: stepDef.name,
              stepIndex: i,
              attempt,
              maxRetries,
              error: lastError.message,
            },
            "Step execution failed"
          );

          // Persist attempt count
          await this.store.updateStep(stepRecord.id, {
            attempts: attempt,
            error: lastError.message,
          });
        }
      }

      if (!stepSucceeded) {
        // Step exhausted all retries — mark as FAILED, then compensate
        await this.store.updateStep(stepRecord.id, {
          status: "FAILED",
          error: lastError?.message ?? "Unknown error",
          completedAt: new Date(),
        });

        this.logger.error(
          {
            sagaId,
            step: stepDef.name,
            stepIndex: i,
            error: lastError?.message,
          },
          "Step failed after all retries — initiating compensation"
        );

        // Run compensation for all completed steps in reverse
        const compensationFailed = await this.compensate(
          sagaId,
          definition,
          context,
          completedStepIndexes
        );

        const finalStatus = compensationFailed ? "FAILED" : "COMPENSATED";
        const errorMsg = `Step "${stepDef.name}" failed: ${lastError?.message}`;

        await this.store.updateSaga(sagaId, {
          status: finalStatus,
          error: compensationFailed
            ? `${errorMsg}. Compensation also failed — manual intervention required.`
            : errorMsg,
          output: context as Record<string, unknown>,
          completedAt: new Date(),
        });

        this.logger.info(
          { sagaId, sagaType: definition.type, finalStatus },
          `Saga ${finalStatus.toLowerCase()}`
        );

        return {
          sagaId,
          outcome: finalStatus === "FAILED" ? "FAILED" : "COMPENSATED",
          context,
          error: errorMsg,
          cached: false,
        };
      }
    }

    // -----------------------------------------------------------------------
    // All steps completed successfully
    // -----------------------------------------------------------------------
    await this.store.updateSaga(sagaId, {
      status: "COMPLETED",
      output: context as Record<string, unknown>,
      completedAt: new Date(),
    });

    this.logger.info(
      { sagaId, sagaType: definition.type },
      "Saga completed successfully"
    );

    return {
      sagaId,
      outcome: "COMPLETED",
      context,
      cached: false,
    };
  }

  // =========================================================================
  // Private: Execute a single step
  // =========================================================================

  private async runStep<TContext extends Record<string, unknown>>(
    sagaId: string,
    stepId: string,
    stepName: string,
    stepIndex: number,
    attempt: number,
    context: TContext,
    executeFn: (context: TContext) => Promise<Partial<TContext>>
  ): Promise<Partial<TContext>> {
    // Mark step as RUNNING
    await this.store.updateStep(stepId, {
      status: "RUNNING",
      attempts: attempt,
      input: context as Record<string, unknown>,
      startedAt: new Date(),
    });

    this.logger.info(
      { sagaId, step: stepName, stepIndex, attempt },
      "Executing saga step"
    );

    // Execute the step's forward action
    const result = await executeFn(context);

    // Mark step as COMPLETED with output
    await this.store.updateStep(stepId, {
      status: "COMPLETED",
      output: (result ?? {}) as Record<string, unknown>,
      completedAt: new Date(),
    });

    this.logger.info(
      { sagaId, step: stepName, stepIndex },
      "Saga step completed"
    );

    return result;
  }

  // =========================================================================
  // Private: Compensation
  // =========================================================================

  /**
   * Runs compensating transactions for completed steps in reverse order.
   *
   * If a compensation step itself fails, we log the error and continue
   * compensating remaining steps. Some compensation is better than none.
   *
   * @returns true if any compensation failed, false if all succeeded
   */
  private async compensate<TContext extends Record<string, unknown>>(
    sagaId: string,
    definition: SagaDefinition<TContext>,
    context: TContext,
    completedStepIndexes: number[]
  ): Promise<boolean> {
    // Mark saga as COMPENSATING
    await this.store.updateSaga(sagaId, { status: "COMPENSATING" });

    const reversedIndexes = [...completedStepIndexes].reverse();
    const failedCompensations: Array<{
      stepName: string;
      stepIndex: number;
      error: string;
    }> = [];

    for (const stepIndex of reversedIndexes) {
      const stepDef = definition.steps[stepIndex];

      if (!stepDef?.compensate) {
        this.logger.info(
          { sagaId, step: stepDef?.name, stepIndex },
          "Step has no compensating transaction — skipping"
        );

        const stepRecord = await this.store.findStep(sagaId, stepIndex);
        if (stepRecord) {
          await this.store.updateStep(stepRecord.id, { status: "SKIPPED" });
        }
        continue;
      }

      const stepRecord = await this.store.findStep(sagaId, stepIndex);
      if (!stepRecord) continue;

      try {
        // Mark step as COMPENSATING
        await this.store.updateStep(stepRecord.id, { status: "COMPENSATING" });

        this.logger.info(
          { sagaId, step: stepDef.name, stepIndex },
          "Running compensating transaction"
        );

        // Execute compensation
        await stepDef.compensate(context);

        // Mark step as COMPENSATED
        await this.store.updateStep(stepRecord.id, {
          status: "COMPENSATED",
          completedAt: new Date(),
        });

        this.logger.info(
          { sagaId, step: stepDef.name, stepIndex },
          "Compensating transaction completed"
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.error(
          { sagaId, step: stepDef.name, stepIndex, error: errorMessage },
          "Compensating transaction FAILED — manual intervention required"
        );

        failedCompensations.push({
          stepName: stepDef.name,
          stepIndex,
          error: errorMessage,
        });

        await this.store.updateStep(stepRecord.id, {
          status: "FAILED",
          error: `Compensation failed: ${errorMessage}`,
          completedAt: new Date(),
        });

        // Continue compensating remaining steps — don't abort the chain.
      }
    }

    return failedCompensations.length > 0;
  }
}
