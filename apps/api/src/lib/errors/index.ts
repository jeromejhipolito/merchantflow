// =============================================================================
// Custom Error Hierarchy
// =============================================================================
// Every error extends AppError. The error handler maps these to HTTP responses.
// Business logic throws domain errors; the framework translates them.
//
// Error classification:
// - Operational errors (expected): validation, not found, conflict, auth
//   -> Return structured JSON, log at WARN level
// - Programming errors (bugs): null reference, type error, assertion failure
//   -> Return generic 500, log at ERROR level, alert
// - Transient errors (retryable): DB timeout, external API 503
//   -> Return 503 with Retry-After, log at WARN level

export enum ErrorCode {
  // 400 Bad Request
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_IDEMPOTENCY_KEY = "INVALID_IDEMPOTENCY_KEY",
  IDEMPOTENCY_KEY_MISMATCH = "IDEMPOTENCY_KEY_MISMATCH",

  // 401 Unauthorized
  UNAUTHORIZED = "UNAUTHORIZED",
  INVALID_HMAC = "INVALID_HMAC",
  EXPIRED_TOKEN = "EXPIRED_TOKEN",

  // 403 Forbidden
  FORBIDDEN = "FORBIDDEN",
  STORE_SUSPENDED = "STORE_SUSPENDED",

  // 404 Not Found
  NOT_FOUND = "NOT_FOUND",
  STORE_NOT_FOUND = "STORE_NOT_FOUND",
  ORDER_NOT_FOUND = "ORDER_NOT_FOUND",
  PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND",
  SHIPMENT_NOT_FOUND = "SHIPMENT_NOT_FOUND",

  // 409 Conflict
  CONFLICT = "CONFLICT",
  DUPLICATE_WEBHOOK = "DUPLICATE_WEBHOOK",
  IDEMPOTENCY_KEY_IN_PROGRESS = "IDEMPOTENCY_KEY_IN_PROGRESS",
  ORDER_ALREADY_FULFILLED = "ORDER_ALREADY_FULFILLED",

  // 422 Unprocessable Entity
  UNPROCESSABLE = "UNPROCESSABLE",
  INSUFFICIENT_INVENTORY = "INSUFFICIENT_INVENTORY",
  INVALID_SHIPMENT_TRANSITION = "INVALID_SHIPMENT_TRANSITION",

  // 429 Rate Limited
  RATE_LIMITED = "RATE_LIMITED",

  // 500 Internal
  INTERNAL_ERROR = "INTERNAL_ERROR",

  // 502 Bad Gateway
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  SHOPIFY_API_ERROR = "SHOPIFY_API_ERROR",

  // 503 Service Unavailable
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
}

const CODE_TO_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_IDEMPOTENCY_KEY]: 400,
  [ErrorCode.IDEMPOTENCY_KEY_MISMATCH]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_HMAC]: 401,
  [ErrorCode.EXPIRED_TOKEN]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.STORE_SUSPENDED]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.STORE_NOT_FOUND]: 404,
  [ErrorCode.ORDER_NOT_FOUND]: 404,
  [ErrorCode.PRODUCT_NOT_FOUND]: 404,
  [ErrorCode.SHIPMENT_NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.DUPLICATE_WEBHOOK]: 409,
  [ErrorCode.IDEMPOTENCY_KEY_IN_PROGRESS]: 409,
  [ErrorCode.ORDER_ALREADY_FULFILLED]: 409,
  [ErrorCode.UNPROCESSABLE]: 422,
  [ErrorCode.INSUFFICIENT_INVENTORY]: 422,
  [ErrorCode.INVALID_SHIPMENT_TRANSITION]: 422,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.SHOPIFY_API_ERROR]: 502,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;
  public readonly retryAfterSeconds?: number;

  constructor(params: {
    code: ErrorCode;
    message: string;
    isOperational?: boolean;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
    cause?: Error;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "AppError";
    this.code = params.code;
    this.statusCode = CODE_TO_STATUS[params.code] ?? 500;
    this.isOperational = params.isOperational ?? true;
    this.details = params.details;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        ...(this.retryAfterSeconds && { retryAfterSeconds: this.retryAfterSeconds }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience factories
// ---------------------------------------------------------------------------

export function notFound(resource: string, id: string): AppError {
  const codeMap: Record<string, ErrorCode> = {
    Store: ErrorCode.STORE_NOT_FOUND,
    Order: ErrorCode.ORDER_NOT_FOUND,
    Product: ErrorCode.PRODUCT_NOT_FOUND,
    Shipment: ErrorCode.SHIPMENT_NOT_FOUND,
  };
  return new AppError({
    code: codeMap[resource] ?? ErrorCode.NOT_FOUND,
    message: `${resource} not found: ${id}`,
  });
}

export function validationError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details,
  });
}

export function conflict(message: string, code?: ErrorCode): AppError {
  return new AppError({
    code: code ?? ErrorCode.CONFLICT,
    message,
  });
}

export function externalServiceError(
  service: string,
  cause?: Error
): AppError {
  return new AppError({
    code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    message: `External service error: ${service}`,
    cause,
    retryAfterSeconds: 30,
  });
}
