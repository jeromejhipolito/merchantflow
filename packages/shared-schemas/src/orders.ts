import { z } from "zod";

export const orderListFiltersSchema = z.object({
  status: z.enum(["UNFULFILLED", "PARTIALLY_FULFILLED", "FULFILLED", "RESTOCKED"]).optional(),
  financialStatus: z.enum(["PENDING", "AUTHORIZED", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED"]).optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  shopifyOrderId: z.string(),
  orderNumber: z.string(),
  totalPrice: z.string(),
  currencyCode: z.string(),
  financialStatus: z.string(),
  fulfillmentStatus: z.string(),
  customerEmail: z.string().nullable(),
  customerFirstName: z.string().nullable(),
  customerLastName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrderListFiltersInput = z.infer<typeof orderListFiltersSchema>;
