import { z } from "zod";

export const createWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.string().min(1)).min(1).max(20),
});

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;
