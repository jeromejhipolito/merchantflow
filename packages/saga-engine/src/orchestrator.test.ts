// =============================================================================
// Saga Orchestrator Tests
// =============================================================================
// Tests for the core saga engine using an in-memory SagaStore implementation.
// This validates the orchestrator's behavior independent of any database.
//
// Test categories:
// 1. Happy path: all steps complete successfully
// 2. Idempotency: duplicate saga execution returns cached result
// 3. Step-level idempotency: resuming a saga skips completed steps
// 4. Compensation: step failure triggers reverse compensation
// 5. Compensation failure: when compensation itself fails
// 6. Retry logic: steps are retried up to maxRetries
// 7. Edge cases: empty saga, single step, no compensate defined

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SagaOrchestrator, generateIdempotencyKey } from "./orchestrator.js";
import type {
  SagaStore,
  SagaInstanceRecord,
  SagaStepRecord,
  SagaDefinition,
  SagaStatus,
  SagaStepStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// In-Memory Saga Store
// ---------------------------------------------------------------------------
// A simple in-memory implementation of SagaStore for testing.
// Production code uses PrismaSagaStore.

class InMemorySagaStore implements SagaStore {
  public sagas: Map<string, SagaInstanceRecord & { steps: SagaStepRecord[] }> =
    new Map();
  public steps: Map<string, SagaStepRecord> = new Map();

  private nextId = 1;

  private genId(): string {
    return `id-${this.nextId++}`;
  }

  async findSagaByIdempotencyKey(
    idempotencyKey: string
  ): Promise<(SagaInstanceRecord & { steps: SagaStepRecord[] }) | null> {
    for (const saga of this.sagas.values()) {
      if (saga.idempotencyKey === idempotencyKey) {
        return { ...saga, steps: [...saga.steps] };
      }
    }
    return null;
  }

  async createSaga(params: {
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
  }): Promise<SagaInstanceRecord & { steps: SagaStepRecord[] }> {
    const sagaId = this.genId();
    const stepRecords: SagaStepRecord[] = params.steps.map((s) => {
      const stepId = this.genId();
      const record: SagaStepRecord = {
        id: stepId,
        sagaId,
        stepName: s.stepName,
        stepIndex: s.stepIndex,
        status: "PENDING",
        idempotencyKey: s.idempotencyKey,
        input: null,
        output: null,
        error: null,
        attempts: 0,
        startedAt: null,
        completedAt: null,
      };
      this.steps.set(stepId, record);
      return record;
    });

    const saga: SagaInstanceRecord & { steps: SagaStepRecord[] } = {
      id: sagaId,
      type: params.type,
      status: params.status,
      storeId: params.storeId,
      idempotencyKey: params.idempotencyKey,
      input: params.input,
      output: null,
      error: null,
      startedAt: new Date(),
      completedAt: null,
      steps: stepRecords,
    };

    this.sagas.set(sagaId, saga);
    return { ...saga, steps: [...stepRecords] };
  }

  async updateSaga(
    sagaId: string,
    data: Partial<
      Pick<SagaInstanceRecord, "status" | "output" | "error" | "completedAt">
    >
  ): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga) throw new Error(`Saga ${sagaId} not found`);
    if (data.status !== undefined) saga.status = data.status;
    if (data.output !== undefined) saga.output = data.output;
    if (data.error !== undefined) saga.error = data.error;
    if (data.completedAt !== undefined) saga.completedAt = data.completedAt;
  }

  async findStep(
    sagaId: string,
    stepIndex: number
  ): Promise<SagaStepRecord | null> {
    for (const step of this.steps.values()) {
      if (step.sagaId === sagaId && step.stepIndex === stepIndex) {
        return { ...step };
      }
    }
    return null;
  }

  async updateStep(
    stepId: string,
    data: Partial<
      Pick<
        SagaStepRecord,
        | "status"
        | "input"
        | "output"
        | "error"
        | "attempts"
        | "startedAt"
        | "completedAt"
      >
    >
  ): Promise<void> {
    const step = this.steps.get(stepId);
    if (!step) throw new Error(`Step ${stepId} not found`);
    if (data.status !== undefined) step.status = data.status;
    if (data.input !== undefined) step.input = data.input;
    if (data.output !== undefined) step.output = data.output;
    if (data.error !== undefined) step.error = data.error;
    if (data.attempts !== undefined) step.attempts = data.attempts;
    if (data.startedAt !== undefined) step.startedAt = data.startedAt;
    if (data.completedAt !== undefined) step.completedAt = data.completedAt;

    // Also update the step in the parent saga's steps array
    for (const saga of this.sagas.values()) {
      const idx = saga.steps.findIndex((s) => s.id === stepId);
      if (idx !== -1) {
        saga.steps[idx] = { ...step };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test Context Type
// ---------------------------------------------------------------------------

interface TestContext extends Record<string, unknown> {
  input: string;
  step1Result?: string;
  step2Result?: string;
  step3Result?: string;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SagaOrchestrator", () => {
  let store: InMemorySagaStore;
  let orchestrator: SagaOrchestrator;

  beforeEach(() => {
    store = new InMemorySagaStore();
    orchestrator = new SagaOrchestrator(store);
  });

  // =========================================================================
  // 1. Happy Path
  // =========================================================================

  describe("happy path", () => {
    it("should execute all steps and return COMPLETED", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async (ctx) => ({ step1Result: `processed:${ctx.input}` }),
          },
          {
            name: "Step2",
            execute: async (ctx) => ({
              step2Result: `chained:${ctx.step1Result}`,
            }),
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "hello" },
        "idem-key-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPLETED");
      expect(result.cached).toBe(false);
      expect(result.context.step1Result).toBe("processed:hello");
      expect(result.context.step2Result).toBe("chained:processed:hello");
      expect(result.error).toBeUndefined();
    });

    it("should persist saga as COMPLETED in the store", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "Step1", execute: async () => ({ step1Result: "done" }) },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "idem-key-2",
        "store-1"
      );

      const stored = store.sagas.get(result.sagaId);
      expect(stored).toBeDefined();
      expect(stored!.status).toBe("COMPLETED");
      expect(stored!.completedAt).toBeInstanceOf(Date);
    });

    it("should mark each step as COMPLETED with output", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "Step1", execute: async () => ({ step1Result: "a" }) },
          { name: "Step2", execute: async () => ({ step2Result: "b" }) },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "idem-key-3",
        "store-1"
      );

      const saga = store.sagas.get(result.sagaId)!;
      expect(saga.steps).toHaveLength(2);
      expect(saga.steps[0]!.status).toBe("COMPLETED");
      expect(saga.steps[0]!.output).toEqual({ step1Result: "a" });
      expect(saga.steps[1]!.status).toBe("COMPLETED");
      expect(saga.steps[1]!.output).toEqual({ step2Result: "b" });
    });
  });

  // =========================================================================
  // 2. Saga-Level Idempotency
  // =========================================================================

  describe("saga-level idempotency", () => {
    it("should return cached result for duplicate idempotency key", async () => {
      const executeFn = vi.fn().mockResolvedValue({ step1Result: "done" });

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [{ name: "Step1", execute: executeFn }],
      };

      // First execution
      const result1 = await orchestrator.execute(
        definition,
        { input: "x" },
        "idem-dup-1",
        "store-1"
      );
      expect(result1.outcome).toBe("COMPLETED");
      expect(result1.cached).toBe(false);
      expect(executeFn).toHaveBeenCalledTimes(1);

      // Second execution with same key
      const result2 = await orchestrator.execute(
        definition,
        { input: "x" },
        "idem-dup-1",
        "store-1"
      );
      expect(result2.outcome).toBe("COMPLETED");
      expect(result2.cached).toBe(true);
      expect(result2.sagaId).toBe(result1.sagaId);
      // Execute function should NOT be called again
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it("should return cached COMPENSATED result for failed duplicate", async () => {
      let callCount = 0;
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "Step1", execute: async () => ({ step1Result: "ok" }) },
          {
            name: "Step2",
            maxRetries: 1,
            execute: async () => {
              callCount++;
              throw new Error("permanent failure");
            },
          },
        ],
      };

      const result1 = await orchestrator.execute(
        definition,
        { input: "x" },
        "idem-fail-1",
        "store-1"
      );
      expect(result1.outcome).toBe("COMPENSATED");
      expect(callCount).toBe(1);

      // Duplicate should return cached
      const result2 = await orchestrator.execute(
        definition,
        { input: "x" },
        "idem-fail-1",
        "store-1"
      );
      expect(result2.outcome).toBe("COMPENSATED");
      expect(result2.cached).toBe(true);
      expect(callCount).toBe(1); // not called again
    });
  });

  // =========================================================================
  // 3. Step-Level Idempotency (Resume)
  // =========================================================================

  describe("step-level idempotency (resume)", () => {
    it("should skip completed steps when resuming a RUNNING saga", async () => {
      const step1Execute = vi.fn().mockResolvedValue({ step1Result: "done" });
      const step2Execute = vi
        .fn()
        .mockResolvedValue({ step2Result: "also-done" });

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "Step1", execute: step1Execute },
          { name: "Step2", execute: step2Execute },
        ],
      };

      // Manually create a saga with Step1 COMPLETED and Step2 PENDING
      // to simulate a crash-and-resume scenario
      const saga = await store.createSaga({
        type: "TEST_SAGA",
        status: "RUNNING",
        storeId: "store-1",
        idempotencyKey: "resume-key-1",
        input: { input: "hello" },
        steps: [
          {
            stepName: "Step1",
            stepIndex: 0,
            idempotencyKey: generateIdempotencyKey("resume-key-1", "Step1"),
          },
          {
            stepName: "Step2",
            stepIndex: 1,
            idempotencyKey: generateIdempotencyKey("resume-key-1", "Step2"),
          },
        ],
      });

      // Mark Step1 as COMPLETED with output
      await store.updateStep(saga.steps[0]!.id, {
        status: "COMPLETED",
        output: { step1Result: "done" },
        completedAt: new Date(),
      });

      // Now execute with the same idempotency key — should resume
      const result = await orchestrator.execute(
        definition,
        { input: "hello" },
        "resume-key-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPLETED");
      // Step1 should NOT have been re-executed
      expect(step1Execute).not.toHaveBeenCalled();
      // Step2 should have been executed
      expect(step2Execute).toHaveBeenCalledTimes(1);
      // Context should include Step1's cached output
      expect(result.context.step1Result).toBe("done");
      expect(result.context.step2Result).toBe("also-done");
    });
  });

  // =========================================================================
  // 4. Compensation
  // =========================================================================

  describe("compensation", () => {
    it("should run compensating transactions in reverse order on failure", async () => {
      const compensationOrder: string[] = [];

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async () => ({ step1Result: "a" }),
            compensate: async () => {
              compensationOrder.push("Step1");
            },
          },
          {
            name: "Step2",
            execute: async () => ({ step2Result: "b" }),
            compensate: async () => {
              compensationOrder.push("Step2");
            },
          },
          {
            name: "Step3",
            maxRetries: 1,
            execute: async () => {
              throw new Error("Step3 failed");
            },
            compensate: async () => {
              compensationOrder.push("Step3");
            },
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "comp-key-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPENSATED");
      expect(result.error).toContain("Step3 failed");

      // Compensation should run in reverse order for completed steps (Step2 then Step1)
      // Step3 was never completed, so it's not compensated
      expect(compensationOrder).toEqual(["Step2", "Step1"]);
    });

    it("should skip compensation for steps without compensate function", async () => {
      const compensated: string[] = [];

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async () => ({ step1Result: "a" }),
            // No compensate — like a validation step
          },
          {
            name: "Step2",
            execute: async () => ({ step2Result: "b" }),
            compensate: async () => {
              compensated.push("Step2");
            },
          },
          {
            name: "Step3",
            maxRetries: 1,
            execute: async () => {
              throw new Error("fail");
            },
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "comp-skip-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPENSATED");
      // Only Step2 should be compensated (Step1 has no compensate)
      expect(compensated).toEqual(["Step2"]);
    });

    it("should pass full context to compensate functions", async () => {
      let compensateContext: TestContext | undefined;

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async () => ({ step1Result: "accumulated" }),
            compensate: async (ctx) => {
              compensateContext = ctx;
            },
          },
          {
            name: "Step2",
            maxRetries: 1,
            execute: async () => {
              throw new Error("fail");
            },
          },
        ],
      };

      await orchestrator.execute(
        definition,
        { input: "original" },
        "comp-ctx-1",
        "store-1"
      );

      expect(compensateContext).toBeDefined();
      expect(compensateContext!.input).toBe("original");
      expect(compensateContext!.step1Result).toBe("accumulated");
    });
  });

  // =========================================================================
  // 5. Compensation Failure
  // =========================================================================

  describe("compensation failure", () => {
    it("should mark saga as FAILED if compensation itself fails", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async () => ({ step1Result: "done" }),
            compensate: async () => {
              throw new Error("compensation failed!");
            },
          },
          {
            name: "Step2",
            maxRetries: 1,
            execute: async () => {
              throw new Error("step2 failed");
            },
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "comp-fail-1",
        "store-1"
      );

      // When compensation fails, the outcome is FAILED (not COMPENSATED)
      expect(result.outcome).toBe("FAILED");
      expect(result.error).toContain("step2 failed");
    });

    it("should continue compensating other steps even if one compensation fails", async () => {
      const compensated: string[] = [];

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async () => ({ step1Result: "a" }),
            compensate: async () => {
              compensated.push("Step1");
            },
          },
          {
            name: "Step2",
            execute: async () => ({ step2Result: "b" }),
            compensate: async () => {
              throw new Error("Step2 compensation failed");
            },
          },
          {
            name: "Step3",
            execute: async () => ({ step3Result: "c" }),
            compensate: async () => {
              compensated.push("Step3");
            },
          },
          {
            name: "Step4",
            maxRetries: 1,
            execute: async () => {
              throw new Error("Step4 failed");
            },
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "comp-partial-1",
        "store-1"
      );

      expect(result.outcome).toBe("FAILED");
      // Step3 and Step1 should still be compensated despite Step2's failure
      // Order is reverse: Step3, Step2 (fails), Step1
      expect(compensated).toContain("Step3");
      expect(compensated).toContain("Step1");
    });
  });

  // =========================================================================
  // 6. Retry Logic
  // =========================================================================

  describe("retry logic", () => {
    it("should retry a failing step up to maxRetries", async () => {
      let attempts = 0;

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "FlakyStep",
            maxRetries: 3,
            execute: async () => {
              attempts++;
              if (attempts < 3) {
                throw new Error(`Attempt ${attempts} failed`);
              }
              return { step1Result: "success-on-third-try" };
            },
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "retry-key-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPLETED");
      expect(result.context.step1Result).toBe("success-on-third-try");
      expect(attempts).toBe(3);
    });

    it("should trigger compensation after exhausting all retries", async () => {
      const compensated: string[] = [];

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "Step1",
            execute: async () => ({ step1Result: "ok" }),
            compensate: async () => {
              compensated.push("Step1");
            },
          },
          {
            name: "AlwaysFails",
            maxRetries: 2,
            execute: async () => {
              throw new Error("permanent failure");
            },
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "retry-exhaust-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPENSATED");
      expect(compensated).toEqual(["Step1"]);
    });

    it("should default to 3 retries when maxRetries is not specified", async () => {
      let attempts = 0;

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          {
            name: "NoMaxRetries",
            // maxRetries not set — should default to 3
            execute: async () => {
              attempts++;
              throw new Error(`Attempt ${attempts}`);
            },
          },
        ],
      };

      await orchestrator.execute(
        definition,
        { input: "x" },
        "retry-default-1",
        "store-1"
      );

      expect(attempts).toBe(3); // default maxRetries
    });
  });

  // =========================================================================
  // 7. Edge Cases
  // =========================================================================

  describe("edge cases", () => {
    it("should handle a saga with no steps", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "EMPTY_SAGA",
        steps: [],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "x" },
        "empty-key-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPLETED");
      expect(result.context.input).toBe("x");
    });

    it("should handle a single step saga", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "SINGLE_STEP",
        steps: [
          {
            name: "OnlyStep",
            execute: async (ctx) => ({
              step1Result: `single:${ctx.input}`,
            }),
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "only" },
        "single-key-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPLETED");
      expect(result.context.step1Result).toBe("single:only");
    });

    it("should handle step returning empty object", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "EmptyReturn", execute: async () => ({}) },
          {
            name: "Step2",
            execute: async (ctx) => ({
              step2Result: `after-empty:${ctx.input}`,
            }),
          },
        ],
      };

      const result = await orchestrator.execute(
        definition,
        { input: "test" },
        "empty-return-1",
        "store-1"
      );

      expect(result.outcome).toBe("COMPLETED");
      expect(result.context.step2Result).toBe("after-empty:test");
    });

    it("should use different saga IDs for different idempotency keys", async () => {
      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "Step1", execute: async () => ({ step1Result: "done" }) },
        ],
      };

      const result1 = await orchestrator.execute(
        definition,
        { input: "a" },
        "key-a",
        "store-1"
      );

      const result2 = await orchestrator.execute(
        definition,
        { input: "b" },
        "key-b",
        "store-1"
      );

      expect(result1.sagaId).not.toBe(result2.sagaId);
    });
  });

  // =========================================================================
  // 8. Structured Logging
  // =========================================================================

  describe("structured logging", () => {
    it("should call logger for each step transition", async () => {
      const infoLogs: Array<{ obj: Record<string, unknown>; msg: string }> = [];
      const logger = {
        info: (obj: Record<string, unknown>, msg: string) => {
          infoLogs.push({ obj, msg });
        },
        warn: () => {},
        error: () => {},
      };

      const loggedOrchestrator = new SagaOrchestrator(store, logger);

      const definition: SagaDefinition<TestContext> = {
        type: "TEST_SAGA",
        steps: [
          { name: "Step1", execute: async () => ({ step1Result: "a" }) },
          { name: "Step2", execute: async () => ({ step2Result: "b" }) },
        ],
      };

      await loggedOrchestrator.execute(
        definition,
        { input: "x" },
        "log-key-1",
        "store-1"
      );

      // Should log: saga started, step1 executing, step1 completed,
      //             step2 executing, step2 completed, saga completed
      const messages = infoLogs.map((l) => l.msg);
      expect(messages).toContain("Saga started");
      expect(messages).toContain("Executing saga step");
      expect(messages).toContain("Saga step completed");
      expect(messages).toContain("Saga completed successfully");
    });
  });

  // =========================================================================
  // 9. Idempotency Key Generation
  // =========================================================================

  describe("generateIdempotencyKey", () => {
    it("should produce deterministic output for same inputs", () => {
      const key1 = generateIdempotencyKey("store-1", "order-123", "orders/create");
      const key2 = generateIdempotencyKey("store-1", "order-123", "orders/create");
      expect(key1).toBe(key2);
    });

    it("should produce different output for different inputs", () => {
      const key1 = generateIdempotencyKey("store-1", "order-123", "orders/create");
      const key2 = generateIdempotencyKey("store-1", "order-456", "orders/create");
      expect(key1).not.toBe(key2);
    });

    it("should produce a sha256 hex string (64 chars)", () => {
      const key = generateIdempotencyKey("a", "b", "c");
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
