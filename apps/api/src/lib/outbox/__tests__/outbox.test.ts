import { describe, it, expect, vi } from "vitest";
import { writeOutboxEvent } from "../index.js";

describe("Transactional Outbox", () => {
  describe("writeOutboxEvent", () => {
    it("should create outbox event with correct shape", async () => {
      const mockCreate = vi.fn().mockResolvedValue({ id: "event-1" });
      const tx = { outboxEvent: { create: mockCreate } } as any;

      await writeOutboxEvent(tx, {
        storeId: "store-1",
        aggregateType: "Order",
        aggregateId: "order-1",
        eventType: "order.created",
        payload: { orderId: "order-1", totalPrice: "29.99" },
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: "store-1",
          aggregateType: "Order",
          aggregateId: "order-1",
          eventType: "order.created",
          status: "PENDING",
          payload: expect.any(Object),
        }),
      });
    });

    it("should always set status to PENDING", async () => {
      const mockCreate = vi.fn().mockResolvedValue({ id: "event-1" });
      const tx = { outboxEvent: { create: mockCreate } } as any;

      await writeOutboxEvent(tx, {
        storeId: "store-1",
        aggregateType: "Shipment",
        aggregateId: "ship-1",
        eventType: "shipment.shipped",
        payload: {},
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: "PENDING" }),
      });
    });
  });
});
