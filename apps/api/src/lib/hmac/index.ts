// =============================================================================
// HMAC Verification
// =============================================================================
// Two distinct HMAC use cases:
//
// 1. INBOUND: Verifying Shopify webhooks
//    Shopify signs the body with the app's webhook secret and sends it in
//    the X-Shopify-Hmac-Sha256 header (base64-encoded).
//
// 2. OUTBOUND: Signing our webhook deliveries to merchants
//    We sign the payload with the endpoint's secret and include it in the
//    X-MerchantFlow-Signature header so merchants can verify authenticity.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Shopify webhook HMAC signature.
 *
 * @param rawBody - The raw request body (Buffer, NOT parsed JSON)
 * @param hmacHeader - The X-Shopify-Hmac-Sha256 header value (base64)
 * @param secret - The Shopify webhook secret
 * @returns true if the signature is valid
 *
 * IMPORTANT: The body MUST be the raw bytes, not a re-serialized JSON string.
 * Fastify must be configured to preserve the raw body for webhook routes.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string,
  secret: string
): boolean {
  const computed = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(computed);
  const b = Buffer.from(hmacHeader);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Signs a webhook payload for outbound delivery.
 * Returns the signature as a hex string for the X-MerchantFlow-Signature header.
 *
 * Format: sha256=<hex>
 * (Same convention as GitHub webhooks — widely understood by consumers)
 */
export function signWebhookPayload(
  payload: string,
  secret: string
): string {
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `sha256=${signature}`;
}

/**
 * Verifies a MerchantFlow webhook signature.
 * Merchants use this on their end to verify our deliveries.
 * Exported for documentation / SDK purposes.
 */
export function verifyMerchantFlowSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = signWebhookPayload(payload, secret);

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
