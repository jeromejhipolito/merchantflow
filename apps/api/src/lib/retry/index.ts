// =============================================================================
// Retry with Exponential Backoff + Jitter
// =============================================================================
// Used for ALL external HTTP calls (Shopify API, carrier APIs, webhook delivery).
//
// Algorithm: Full Jitter (AWS recommended)
//   delay = random_between(0, min(cap, base * 2^attempt))
//
// Why full jitter over equal jitter?
// When many workers retry simultaneously (thundering herd after an outage),
// equal jitter still clusters retries around the midpoint. Full jitter
// spreads them uniformly across the entire window.
//
// References:
// - https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in milliseconds. Default: 500 */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** Which errors are retryable. Default: retries on network errors + 5xx */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each retry. Useful for logging. */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  isRetryable: defaultIsRetryable,
  onRetry: () => {},
};

/**
 * Calculates delay using full jitter strategy.
 * delay = random(0, min(cap, base * 2^attempt))
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(maxDelayMs, exponentialDelay);
  // Full jitter: uniform random in [0, cappedDelay]
  return Math.floor(Math.random() * cappedDelay);
}

/**
 * Calculate the next retry timestamp for a given attempt number.
 * Used by the outbox poller and webhook delivery to set nextRetryAt in the DB.
 */
export function calculateNextRetryAt(
  attempt: number,
  baseDelayMs: number = 500,
  maxDelayMs: number = 30_000
): Date {
  const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
  return new Date(Date.now() + delay);
}

/**
 * Executes an async function with retry logic.
 *
 * Usage:
 *   const result = await withRetry(() => shopifyClient.getOrder(orderId), {
 *     maxAttempts: 3,
 *     onRetry: (attempt, delay, err) => logger.warn({ attempt, delay, err }, 'Retrying Shopify call'),
 *   });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === opts.maxAttempts - 1;
      if (isLastAttempt || !opts.isRetryable(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      opts.onRetry(attempt + 1, delay, error);

      await sleep(delay);
    }
  }

  // Unreachable, but TypeScript needs it
  throw lastError;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultIsRetryable(error: unknown): boolean {
  // Network errors (fetch failures, DNS resolution, connection reset)
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // HTTP response errors with status codes
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    // Retry on 429 (rate limited) and 5xx (server errors)
    // Do NOT retry on 4xx client errors (except 429)
    return status === 429 || (status >= 500 && status <= 599);
  }

  // Prisma connection errors
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: string }).code;
    // P1001 = can't reach database, P1002 = timed out
    return code === "P1001" || code === "P1002";
  }

  return false;
}
