// =============================================================================
// Shopify OAuth Flow
// =============================================================================
// Implements the Shopify OAuth 2.0 authorization code flow:
//
// 1. Merchant clicks "Install" on the Shopify app listing
// 2. Shopify redirects to our /auth/shopify endpoint with { shop, hmac, ... }
// 3. We verify the HMAC, then redirect the merchant to Shopify's OAuth consent page
// 4. Merchant approves, Shopify redirects back to /auth/shopify/callback with { code, shop, hmac }
// 5. We verify the HMAC, exchange the code for a permanent access token
// 6. We store the access token (encrypted) and create the Store record
//
// Security:
// - HMAC verification on EVERY redirect from Shopify (prevents MITM)
// - State parameter (nonce) to prevent CSRF
// - Access token encrypted at rest using AES-256-GCM

import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import type { ShopifyClientConfig } from "./client.js";
import { AppError, ErrorCode } from "../errors/index.js";

/**
 * Verifies the HMAC signature on Shopify OAuth query parameters.
 * Shopify signs the query string with the app's API secret.
 */
export function verifyShopifyOAuthHmac(
  queryParams: Record<string, string>,
  apiSecret: string
): boolean {
  const hmac = queryParams.hmac;
  if (!hmac) return false;

  // Build the message: alphabetically sorted key=value pairs, excluding hmac
  const entries = Object.entries(queryParams)
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const computed = createHmac("sha256", apiSecret)
    .update(entries)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(computed, hmac);
}

/**
 * Generates the Shopify OAuth consent URL.
 */
export function buildAuthorizationUrl(
  shop: string,
  config: ShopifyClientConfig,
  scopes: string,
  redirectUri: string,
  nonce: string
): string {
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state: nonce,
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges the authorization code for a permanent access token.
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
  config: ShopifyClientConfig
): Promise<{ accessToken: string; scope: string }> {
  const response = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.apiKey,
        client_secret: config.apiSecret,
        code,
      }),
    }
  );

  if (!response.ok) {
    throw new AppError({
      code: ErrorCode.SHOPIFY_API_ERROR,
      message: `Failed to exchange Shopify OAuth code for ${shop}: ${response.status}`,
    });
  }

  const data = (await response.json()) as {
    access_token: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}

/**
 * Generates a cryptographic nonce for OAuth state parameter.
 */
export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// Access Token Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------
// We never store Shopify access tokens in plaintext. The encryption key
// comes from the ENCRYPTION_KEY env var (32-byte hex = 64 hex chars).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encryptAccessToken(
  plaintext: string,
  encryptionKeyHex: string
): string {
  const key = Buffer.from(encryptionKeyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptAccessToken(
  ciphertext: string,
  encryptionKeyHex: string
): string {
  const parts = ciphertext.split(":");
  const ivHex = parts[0] ?? "";
  const authTagHex = parts[1] ?? "";
  const encryptedHex = parts[2] ?? "";
  const key = Buffer.from(encryptionKeyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}
