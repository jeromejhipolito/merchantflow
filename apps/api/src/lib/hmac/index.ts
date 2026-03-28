import { createHmac, timingSafeEqual } from "node:crypto";

// Shopify inbound: verify X-Shopify-Hmac-Sha256 (base64)
// Outbound: sign deliveries with X-MerchantFlow-Signature (sha256=hex)
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string,
  secret: string
): boolean {
  const computed = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  // timing-safe comparison
  const a = Buffer.from(computed);
  const b = Buffer.from(hmacHeader);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signWebhookPayload(
  payload: string,
  secret: string
): string {
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `sha256=${signature}`;
}

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
