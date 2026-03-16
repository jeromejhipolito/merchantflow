import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idempotencyKeyHeader = z.string().uuid();

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
