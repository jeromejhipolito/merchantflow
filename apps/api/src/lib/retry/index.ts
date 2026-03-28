// Full jitter exponential backoff for external calls

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

export function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(maxDelayMs, exponentialDelay);
  return Math.floor(Math.random() * cappedDelay);
}

export function calculateNextRetryAt(
  attempt: number,
  baseDelayMs: number = 500,
  maxDelayMs: number = 30_000
): Date {
  const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
  return new Date(Date.now() + delay);
}

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

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 429 || (status >= 500 && status <= 599);
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: string }).code;
    return code === "P1001" || code === "P1002"; // Prisma connection errors
  }

  return false;
}
