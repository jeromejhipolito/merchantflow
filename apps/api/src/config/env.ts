import { z } from "zod";

const EnvSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "staging", "production", "test"]),
  PORT: z.string().default("3005"),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),

  // Database
  DATABASE_URL: z.string(),

  // Redis (BullMQ + caching)
  REDIS_URL: z.string(),

  // Auth
  JWT_SECRET: z.string(),
  API_KEY_SALT: z.string(),

  // Shopify
  SHOPIFY_API_KEY: z.string(),
  SHOPIFY_API_SECRET: z.string(),
  SHOPIFY_APP_URL: z.string(),
  SHOPIFY_SCOPES: z
    .string()
    .default("read_products,read_orders,write_fulfillments"),

  // Idempotency
  IDEMPOTENCY_KEY_TTL_HOURS: z.string().default("24"),

  // Outbox poller
  OUTBOX_POLL_INTERVAL_MS: z.string().default("1000"),
  OUTBOX_BATCH_SIZE: z.string().default("50"),

  // Encryption (for Shopify access tokens at rest)
  ENCRYPTION_KEY: z.string(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  return result.data;
}
