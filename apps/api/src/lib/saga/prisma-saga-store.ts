import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  SagaStore,
  SagaInstanceRecord,
  SagaStepRecord,
  SagaStatus,
  SagaStepStatus,
} from "saga-engine-ts";

export class PrismaSagaStore implements SagaStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findSagaByIdempotencyKey(
    idempotencyKey: string
  ): Promise<(SagaInstanceRecord & { steps: SagaStepRecord[] }) | null> {
    const saga = await this.prisma.sagaInstance.findUnique({
      where: { idempotencyKey },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });

    if (!saga) return null;

    return {
      id: saga.id,
      type: saga.type,
      status: saga.status as SagaStatus,
      storeId: saga.storeId,
      idempotencyKey: saga.idempotencyKey,
      input: saga.input as Record<string, unknown>,
      output: saga.output as Record<string, unknown> | null,
      error: saga.error,
      startedAt: saga.startedAt,
      completedAt: saga.completedAt,
      steps: saga.steps.map((s) => this.mapStepRecord(s)),
    };
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
    const saga = await this.prisma.sagaInstance.create({
      data: {
        type: params.type as any,
        status: params.status as any,
        storeId: params.storeId,
        idempotencyKey: params.idempotencyKey,
        input: params.input as Prisma.InputJsonValue,
        startedAt: new Date(),
        steps: {
          create: params.steps.map((step) => ({
            stepName: step.stepName,
            stepIndex: step.stepIndex,
            status: "PENDING" as any,
            idempotencyKey: step.idempotencyKey,
          })),
        },
      },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });

    return {
      id: saga.id,
      type: saga.type,
      status: saga.status as SagaStatus,
      storeId: saga.storeId,
      idempotencyKey: saga.idempotencyKey,
      input: saga.input as Record<string, unknown>,
      output: saga.output as Record<string, unknown> | null,
      error: saga.error,
      startedAt: saga.startedAt,
      completedAt: saga.completedAt,
      steps: saga.steps.map((s) => this.mapStepRecord(s)),
    };
  }

  async updateSaga(
    sagaId: string,
    data: Partial<
      Pick<SagaInstanceRecord, "status" | "output" | "error" | "completedAt">
    >
  ): Promise<void> {
    await this.prisma.sagaInstance.update({
      where: { id: sagaId },
      data: {
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.output !== undefined && {
          output: data.output as Prisma.InputJsonValue,
        }),
        ...(data.error !== undefined && { error: data.error }),
        ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
      },
    });
  }

  async findStep(
    sagaId: string,
    stepIndex: number
  ): Promise<SagaStepRecord | null> {
    const step = await this.prisma.sagaStep.findFirst({
      where: { sagaId, stepIndex },
    });

    if (!step) return null;
    return this.mapStepRecord(step);
  }

  async updateStep(
    stepId: string,
    data: Partial<
      Pick<
        SagaStepRecord,
        "status" | "input" | "output" | "error" | "attempts" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void> {
    await this.prisma.sagaStep.update({
      where: { id: stepId },
      data: {
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.input !== undefined && {
          input: data.input as Prisma.InputJsonValue,
        }),
        ...(data.output !== undefined && {
          output: data.output as Prisma.InputJsonValue,
        }),
        ...(data.error !== undefined && { error: data.error }),
        ...(data.attempts !== undefined && { attempts: data.attempts }),
        ...(data.startedAt !== undefined && { startedAt: data.startedAt }),
        ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
      },
    });
  }

  private mapStepRecord(step: {
    id: string;
    sagaId: string;
    stepName: string;
    stepIndex: number;
    status: string;
    idempotencyKey: string;
    input: Prisma.JsonValue;
    output: Prisma.JsonValue;
    error: string | null;
    attempts: number;
    startedAt: Date | null;
    completedAt: Date | null;
  }): SagaStepRecord {
    return {
      id: step.id,
      sagaId: step.sagaId,
      stepName: step.stepName,
      stepIndex: step.stepIndex,
      status: step.status as SagaStepStatus,
      idempotencyKey: step.idempotencyKey,
      input: step.input as Record<string, unknown> | null,
      output: step.output as Record<string, unknown> | null,
      error: step.error,
      attempts: step.attempts,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
    };
  }
}
