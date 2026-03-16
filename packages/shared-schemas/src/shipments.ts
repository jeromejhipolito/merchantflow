import { z } from "zod";

export const createShipmentSchema = z.object({
  orderId: z.string().uuid(),
  carrier: z.string().max(50).optional(),
  service: z.string().max(50).optional(),
  weightGrams: z.number().int().positive().optional(),
  lengthCm: z.number().positive().optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
});

export const shipShipmentSchema = z.object({
  trackingNumber: z.string().min(1).max(100),
  trackingUrl: z.string().url().optional(),
  carrier: z.string().max(50).optional(),
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type ShipShipmentInput = z.infer<typeof shipShipmentSchema>;
