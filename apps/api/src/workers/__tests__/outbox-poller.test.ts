import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startOutboxPoller } from "../outbox-poller.worker.js";

vi.mock("../../lib/outbox/index.js", () => ({
  pollOutboxEvents: vi.fn(),
  markOutboxEventPublished: vi.fn(),
  markOutboxEventFailed: vi.fn(),
}));

import {
  pollOutboxEvents,
  markOutboxEventPublished,
  markOutboxEventFailed,
} from "../../lib/outbox/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildPrisma() {
  return {} as any; // passed through to outbox functions which are mocked
}

function buildQueues() {
  return {
    "webhook-delivery": { add: vi.fn().mockResolvedValue({}) },
    "label-generation": { add: vi.fn().mockResolvedValue({}) },
    "order-sync": { add: vi.fn().mockResolvedValue({}) },
    "product-sync": { add: vi.fn().mockResolvedValue({}) },
    "store-lifecycle": { add: vi.fn().mockResolvedValue({}) },
    "outbox-publish": { add: vi.fn().mockResolvedValue({}) },
    "inventory-sync": { add: vi.fn().mockResolvedValue({}) },
    cleanup: { add: vi.fn().mockResolvedValue({}) },
  } as any;
}

function sampleEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    storeId: "store-1",
    aggregateType: "Order",
    aggregateId: "order-1",
    eventType: "order.synced",
    payload: { orderId: "order-1" },
    attempts: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Outbox Poller Worker", () => {
  let prisma: any;
  let queues: ReturnType<typeof buildQueues>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    prisma = buildPrisma();
    queues = buildQueues();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========================================================================
  // Polling
  // ========================================================================
  describe("polling events", () => {
    it("should poll pending events from the database", async () => {
      (pollOutboxEvents as any).mockResolvedValue([]);

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 1000,
        batchSize: 50,
      });

      // The initial setTimeout(poll, 0) — advance past it
      await vi.advanceTimersByTimeAsync(0);

      expect(pollOutboxEvents).toHaveBeenCalledWith(prisma, 50);

      poller.stop();
    });

    it("should dispatch events to the correct BullMQ queues", async () => {
      const event = sampleEvent({ eventType: "order.synced" });
      (pollOutboxEvents as any).mockResolvedValueOnce([event]);

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 1000,
        batchSize: 50,
      });

      await vi.advanceTimersByTimeAsync(0);

      // order.synced goes to webhook-delivery (all events go there)
      expect(queues["webhook-delivery"].add).toHaveBeenCalledWith(
        "order.synced",
        expect.objectContaining({
          outboxEventId: "evt-1",
          storeId: "store-1",
          eventType: "order.synced",
        }),
        expect.objectContaining({
          jobId: "outbox-evt-1-webhook-delivery",
        })
      );

      poller.stop();
    });

    it("should also dispatch shipment.created events to label-generation queue", async () => {
      const event = sampleEvent({
        id: "evt-2",
        eventType: "shipment.created",
        aggregateType: "Shipment",
        aggregateId: "ship-1",
      });
      (pollOutboxEvents as any).mockResolvedValueOnce([event]);

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 1000,
        batchSize: 50,
      });

      await vi.advanceTimersByTimeAsync(0);

      // shipment.created goes to both webhook-delivery and label-generation
      expect(queues["webhook-delivery"].add).toHaveBeenCalled();
      expect(queues["label-generation"].add).toHaveBeenCalledWith(
        "shipment.created",
        expect.objectContaining({ outboxEventId: "evt-2" }),
        expect.any(Object)
      );

      poller.stop();
    });
  });

  // ========================================================================
  // Marking events
  // ========================================================================
  describe("event lifecycle", () => {
    it("should mark events as PUBLISHED on successful queue dispatch", async () => {
      const event = sampleEvent();
      (pollOutboxEvents as any).mockResolvedValueOnce([event]);

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 1000,
        batchSize: 50,
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(markOutboxEventPublished).toHaveBeenCalledWith(prisma, "evt-1");

      poller.stop();
    });

    it("should mark events as FAILED when queue dispatch throws", async () => {
      const event = sampleEvent({ attempts: 3 });
      (pollOutboxEvents as any).mockResolvedValueOnce([event]);
      queues["webhook-delivery"].add.mockRejectedValueOnce(
        new Error("Queue connection lost")
      );

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 1000,
        batchSize: 50,
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(markOutboxEventFailed).toHaveBeenCalledWith(
        prisma,
        "evt-1",
        "Queue connection lost",
        3
      );
      // Should NOT mark as published
      expect(markOutboxEventPublished).not.toHaveBeenCalled();

      poller.stop();
    });
  });

  // ========================================================================
  // Stop behavior
  // ========================================================================
  describe("stop()", () => {
    it("should stop polling when stop() is called", async () => {
      (pollOutboxEvents as any).mockResolvedValue([]);

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 500,
        batchSize: 50,
      });

      // Let the first poll run
      await vi.advanceTimersByTimeAsync(0);
      expect(pollOutboxEvents).toHaveBeenCalledTimes(1);

      poller.stop();

      // Advance past another interval — should NOT poll again
      await vi.advanceTimersByTimeAsync(1000);
      expect(pollOutboxEvents).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Poll cycle error resilience
  // ========================================================================
  describe("error resilience", () => {
    it("should continue polling even if a poll cycle fails", async () => {
      (pollOutboxEvents as any)
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce([]);

      const poller = startOutboxPoller(prisma, queues, {
        pollIntervalMs: 500,
        batchSize: 50,
      });

      // First poll — fails
      await vi.advanceTimersByTimeAsync(0);
      expect(pollOutboxEvents).toHaveBeenCalledTimes(1);

      // Second poll — should still run after interval
      await vi.advanceTimersByTimeAsync(500);
      expect(pollOutboxEvents).toHaveBeenCalledTimes(2);

      poller.stop();
    });
  });
});
