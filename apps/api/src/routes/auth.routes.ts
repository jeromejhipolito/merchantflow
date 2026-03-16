// =============================================================================
// Shopify OAuth Routes
// =============================================================================
// GET  /auth/shopify           — Initiates OAuth flow
// GET  /auth/shopify/callback  — Handles OAuth callback, exchanges code for token

import type { FastifyInstance } from "fastify";
import {
  verifyShopifyOAuthHmac,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  generateNonce,
} from "../lib/shopify/oauth.js";
import { AppError, ErrorCode } from "../lib/errors/index.js";
import { StoreService } from "../modules/store/store.service.js";

// In-memory nonce store. In production, use Redis with TTL.
const nonceStore = new Map<string, { shop: string; createdAt: number }>();

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const env = app.env;
  const prisma = app.prisma;
  const storeService = new StoreService(prisma, env.ENCRYPTION_KEY);

  const shopifyConfig = {
    apiKey: env.SHOPIFY_API_KEY,
    apiSecret: env.SHOPIFY_API_SECRET,
    apiVersion: "2024-01",
  };

  // -------------------------------------------------------------------------
  // Step 1: Initiate OAuth
  // -------------------------------------------------------------------------
  app.get<{
    Querystring: { shop?: string; hmac?: string; timestamp?: string };
  }>("/shopify", async (request, reply) => {
    const { shop, hmac } = request.query;

    if (!shop) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Missing "shop" query parameter.',
      });
    }

    // Validate shop domain format (must be *.myshopify.com)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Invalid shop domain format. Expected: your-store.myshopify.com",
      });
    }

    // Verify HMAC if present (Shopify signs the install request)
    if (hmac) {
      const isValid = verifyShopifyOAuthHmac(
        request.query as Record<string, string>,
        shopifyConfig.apiSecret
      );
      if (!isValid) {
        throw new AppError({
          code: ErrorCode.INVALID_HMAC,
          message: "Invalid HMAC signature on OAuth request.",
        });
      }
    }

    // Generate nonce for CSRF protection
    const nonce = generateNonce();
    nonceStore.set(nonce, { shop, createdAt: Date.now() });

    // Clean up old nonces (> 10 minutes)
    for (const [key, value] of nonceStore) {
      if (Date.now() - value.createdAt > 600_000) nonceStore.delete(key);
    }

    const redirectUri = `${env.SHOPIFY_APP_URL}/auth/shopify/callback`;
    const authUrl = buildAuthorizationUrl(
      shop,
      shopifyConfig,
      env.SHOPIFY_SCOPES,
      redirectUri,
      nonce
    );

    return reply.redirect(authUrl);
  });

  // -------------------------------------------------------------------------
  // Step 2: Handle OAuth callback
  // -------------------------------------------------------------------------
  app.get<{
    Querystring: {
      code?: string;
      shop?: string;
      hmac?: string;
      state?: string;
      timestamp?: string;
    };
  }>("/shopify/callback", async (request, reply) => {
    const { code, shop, state } = request.query;

    if (!code || !shop || !state) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Missing required OAuth callback parameters.",
      });
    }

    // Verify HMAC
    const isValid = verifyShopifyOAuthHmac(
      request.query as Record<string, string>,
      shopifyConfig.apiSecret
    );
    if (!isValid) {
      throw new AppError({
        code: ErrorCode.INVALID_HMAC,
        message: "Invalid HMAC signature on OAuth callback.",
      });
    }

    // Verify nonce (CSRF protection)
    const nonceData = nonceStore.get(state);
    if (!nonceData || nonceData.shop !== shop) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid or expired state parameter. Please restart the installation.",
      });
    }
    nonceStore.delete(state);

    // Exchange code for access token
    const { accessToken, scope } = await exchangeCodeForToken(
      shop,
      code,
      shopifyConfig
    );

    // Create or re-activate the store
    const store = await storeService.createOrReinstall({
      shopifyDomain: shop,
      shopifyAccessToken: accessToken,
      shopifyScopes: scope,
      name: shop.replace(".myshopify.com", ""),
      email: "", // fetched from Shopify in a follow-up sync job
    });

    request.log.info(
      { storeId: store.id, shopifyDomain: shop },
      "Shopify OAuth completed — store installed"
    );

    // Redirect to the app's embedded UI (or a success page)
    return reply.redirect(
      `${env.SHOPIFY_APP_URL}/app?shop=${shop}&installed=true`
    );
  });
}
