// =============================================================================
// Shopify API Client
// =============================================================================
// Wraps all Shopify REST/GraphQL calls with:
// - Automatic retry with exponential backoff + jitter
// - Rate limit awareness (Shopify returns 429 + Retry-After header)
// - Structured error mapping to our AppError hierarchy
// - Request logging for observability
//
// All methods accept a store's access token — we do NOT store a global token.
// Each store has its own OAuth token scoped to that shop.

import { withRetry, type RetryOptions } from "../retry/index.js";
import { AppError, ErrorCode } from "../errors/index.js";

export interface ShopifyClientConfig {
  apiKey: string;
  apiSecret: string;
  apiVersion: string; // e.g. "2024-01"
}

export interface ShopifyRequestOptions {
  shopDomain: string;
  accessToken: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string; // e.g. "/admin/api/2024-01/orders.json"
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  retryOptions?: RetryOptions;
}

interface ShopifyErrorBody {
  errors?: string | Record<string, string[]>;
}

export class ShopifyClient {
  private config: ShopifyClientConfig;

  constructor(config: ShopifyClientConfig) {
    this.config = config;
  }

  /**
   * Make an authenticated request to the Shopify Admin API.
   * Retries automatically on 429 and 5xx errors.
   */
  async request<T>(options: ShopifyRequestOptions): Promise<T> {
    const {
      shopDomain,
      accessToken,
      method = "GET",
      path,
      body,
      query,
      retryOptions,
    } = options;

    const url = new URL(`https://${shopDomain}${path}`);
    if (query) {
      Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    return withRetry(
      async () => {
        const response = await fetch(url.toString(), {
          method,
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(
            () => ({})
          )) as ShopifyErrorBody;

          // 429: Shopify rate limit — the error is retryable
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            const error = new AppError({
              code: ErrorCode.RATE_LIMITED,
              message: `Shopify rate limited for ${shopDomain}`,
              retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : 2,
            });
            // Attach status so retry logic can classify it
            (error as any).status = 429;
            throw error;
          }

          // 5xx: Shopify server error — retryable
          if (response.status >= 500) {
            const error = new AppError({
              code: ErrorCode.SHOPIFY_API_ERROR,
              message: `Shopify API error (${response.status}) for ${shopDomain}: ${JSON.stringify(errorBody.errors)}`,
            });
            (error as any).status = response.status;
            throw error;
          }

          // 4xx: Client error — NOT retryable (except 429 handled above)
          throw new AppError({
            code: ErrorCode.SHOPIFY_API_ERROR,
            message: `Shopify API error (${response.status}) for ${shopDomain}: ${JSON.stringify(errorBody.errors)}`,
            details: { status: response.status, errors: errorBody.errors },
          });
        }

        return (await response.json()) as T;
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 15_000,
        ...retryOptions,
      }
    );
  }

  // -------------------------------------------------------------------------
  // Domain-specific methods
  // -------------------------------------------------------------------------

  async getOrder(shopDomain: string, accessToken: string, orderId: string) {
    return this.request<{ order: Record<string, unknown> }>({
      shopDomain,
      accessToken,
      path: `/admin/api/${this.config.apiVersion}/orders/${orderId}.json`,
    });
  }

  async getOrders(
    shopDomain: string,
    accessToken: string,
    params?: { since_id?: string; limit?: number; status?: string }
  ) {
    return this.request<{ orders: Record<string, unknown>[] }>({
      shopDomain,
      accessToken,
      path: `/admin/api/${this.config.apiVersion}/orders.json`,
      query: params as Record<string, string>,
    });
  }

  async getProducts(
    shopDomain: string,
    accessToken: string,
    params?: { since_id?: string; limit?: number }
  ) {
    return this.request<{ products: Record<string, unknown>[] }>({
      shopDomain,
      accessToken,
      path: `/admin/api/${this.config.apiVersion}/products.json`,
      query: params as Record<string, string>,
    });
  }

  async createFulfillment(
    shopDomain: string,
    accessToken: string,
    orderId: string,
    fulfillmentData: Record<string, unknown>
  ) {
    return this.request<{ fulfillment: Record<string, unknown> }>({
      shopDomain,
      accessToken,
      method: "POST",
      path: `/admin/api/${this.config.apiVersion}/orders/${orderId}/fulfillments.json`,
      body: { fulfillment: fulfillmentData },
    });
  }
}
