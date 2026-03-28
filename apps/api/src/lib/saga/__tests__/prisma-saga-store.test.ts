import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrismaSagaStore } from "../prisma-saga-store.js";

function createMockPrisma() {
  return {
    sagaInstance: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sagaStep: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  } as any;
}

describe("PrismaSagaStore", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let store: PrismaSagaStore;

  beforeEach(() => {
    prisma = createMockPrisma();
    store = new PrismaSagaStore(prisma);
  });

  describe("findSagaByIdempotencyKey", () => {
    it("should return null when saga is not found", async () => {
      prisma.sagaInstance.findUnique.mockResolvedValue(null);

      const result = await store.findSagaByIdempotencyKey("non-existent");

      expect(result).toBeNull();
      expect(prisma.sagaInstance.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: "non-existent" },
        include: { steps: { orderBy: { stepIndex: "asc" } } },
      });
    });

    it("should map Prisma result to SagaInstanceRecord shape", async () => {
      const startedAt = new Date();
      prisma.sagaInstance.findUnique.mockResolvedValue({
        id: "saga-1",
        type: "ORDER_PROCESSING",
        status: "COMPLETED",
        storeId: "store-1",
        idempotencyKey: "key-1",
        input: { foo: "bar" },
        output: { orderId: "order-1" },
        error: null,
        startedAt,
        completedAt: new Date(),
        steps: [
          {
            id: "step-1",
            sagaId: "saga-1",
            stepName: "Step1",
            stepIndex: 0,
            status: "COMPLETED",
            idempotencyKey: "step-key-1",
            input: null,
            output: { result: "ok" },
            error: null,
            attempts: 1,
            startedAt,
            completedAt: new Date(),
          },
        ],
      });

      const result = await store.findSagaByIdempotencyKey("key-1");

      expect(result).toBeDefined();
      expect(result!.id).toBe("saga-1");
      expect(result!.status).toBe("COMPLETED");
      expect(result!.input).toEqual({ foo: "bar" });
      expect(result!.steps).toHaveLength(1);
      expect(result!.steps[0]!.stepName).toBe("Step1");
    });
  });

  describe("createSaga", () => {
    it("should create saga with nested step records", async () => {
      const now = new Date();
      prisma.sagaInstance.create.mockResolvedValue({
        id: "new-saga",
        type: "FULFILLMENT",
        status: "RUNNING",
        storeId: "store-1",
        idempotencyKey: "new-key",
        input: { orderId: "order-1" },
        output: null,
        error: null,
        startedAt: now,
        completedAt: null,
        steps: [
          {
            id: "s1",
            sagaId: "new-saga",
            stepName: "Validate",
            stepIndex: 0,
            status: "PENDING",
            idempotencyKey: "sk-1",
            input: null,
            output: null,
            error: null,
            attempts: 0,
            startedAt: null,
            completedAt: null,
          },
          {
            id: "s2",
            sagaId: "new-saga",
            stepName: "Create",
            stepIndex: 1,
            status: "PENDING",
            idempotencyKey: "sk-2",
            input: null,
            output: null,
            error: null,
            attempts: 0,
            startedAt: null,
            completedAt: null,
          },
        ],
      });

      const result = await store.createSaga({
        type: "FULFILLMENT",
        status: "RUNNING",
        storeId: "store-1",
        idempotencyKey: "new-key",
        input: { orderId: "order-1" },
        steps: [
          { stepName: "Validate", stepIndex: 0, idempotencyKey: "sk-1" },
          { stepName: "Create", stepIndex: 1, idempotencyKey: "sk-2" },
        ],
      });

      expect(prisma.sagaInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "FULFILLMENT",
            steps: {
              create: expect.arrayContaining([
                expect.objectContaining({ stepName: "Validate", stepIndex: 0 }),
                expect.objectContaining({ stepName: "Create", stepIndex: 1 }),
              ]),
            },
          }),
          include: { steps: { orderBy: { stepIndex: "asc" } } },
        })
      );

      expect(result.id).toBe("new-saga");
      expect(result.steps).toHaveLength(2);
    });
  });

  describe("updateSaga", () => {
    it("should update saga status and completedAt", async () => {
      const now = new Date();
      prisma.sagaInstance.update.mockResolvedValue({});

      await store.updateSaga("saga-1", {
        status: "COMPLETED",
        completedAt: now,
        output: { result: "done" },
      });

      expect(prisma.sagaInstance.update).toHaveBeenCalledWith({
        where: { id: "saga-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: now,
          output: { result: "done" },
        }),
      });
    });

    it("should only include defined fields in update", async () => {
      prisma.sagaInstance.update.mockResolvedValue({});

      await store.updateSaga("saga-1", { status: "FAILED" });

      const updateCall = prisma.sagaInstance.update.mock.calls[0]![0];
      expect(updateCall.data).toHaveProperty("status", "FAILED");
      expect(updateCall.data).not.toHaveProperty("output");
      expect(updateCall.data).not.toHaveProperty("error");
      expect(updateCall.data).not.toHaveProperty("completedAt");
    });
  });

  describe("findStep", () => {
    it("should find step by saga ID and step index", async () => {
      prisma.sagaStep.findFirst.mockResolvedValue({
        id: "step-1",
        sagaId: "saga-1",
        stepName: "Validate",
        stepIndex: 0,
        status: "COMPLETED",
        idempotencyKey: "sk-1",
        input: null,
        output: { valid: true },
        error: null,
        attempts: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = await store.findStep("saga-1", 0);

      expect(result).toBeDefined();
      expect(result!.stepName).toBe("Validate");
      expect(prisma.sagaStep.findFirst).toHaveBeenCalledWith({
        where: { sagaId: "saga-1", stepIndex: 0 },
      });
    });

    it("should return null when step is not found", async () => {
      prisma.sagaStep.findFirst.mockResolvedValue(null);

      const result = await store.findStep("saga-1", 99);

      expect(result).toBeNull();
    });
  });

  describe("updateStep", () => {
    it("should update step status, output, and timestamps", async () => {
      prisma.sagaStep.update.mockResolvedValue({});
      const now = new Date();

      await store.updateStep("step-1", {
        status: "COMPLETED",
        output: { orderId: "order-1" },
        completedAt: now,
        attempts: 1,
      });

      expect(prisma.sagaStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          output: { orderId: "order-1" },
          completedAt: now,
          attempts: 1,
        }),
      });
    });
  });
});
