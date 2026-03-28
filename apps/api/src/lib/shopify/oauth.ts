import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import type { ShopifyClientConfig } from "./client.js";
import { AppError, ErrorCode } from "../errors/index.js";

export function verifyShopifyOAuthHmac(
  queryParams: Record<string, string>,
  apiSecret: string
): boolean {
  const hmac = queryParams.hmac;
  if (!hmac) return false;

  const entries = Object.entries(queryParams)
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const computed = createHmac("sha256", apiSecret)
    .update(entries)
    .digest("hex");

  return timingSafeEqual(computed, hmac);
}

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

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

// AES-256-GCM encryption for access tokens at rest
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}
