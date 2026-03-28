import type { FastifyInstance } from "fastify";
import {
  verifyShopifyOAuthHmac,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  generateNonce,
} from "../lib/shopify/oauth.js";
import { AppError, ErrorCode } from "../lib/errors/index.js";
import { StoreService } from "../modules/store/store.service.js";

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

    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Invalid shop domain format. Expected: your-store.myshopify.com",
      });
    }

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

    const nonce = generateNonce();
    nonceStore.set(nonce, { shop, createdAt: Date.now() });

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

    const nonceData = nonceStore.get(state);
    if (!nonceData || nonceData.shop !== shop) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid or expired state parameter. Please restart the installation.",
      });
    }
    nonceStore.delete(state);

    const { accessToken, scope } = await exchangeCodeForToken(
      shop,
      code,
      shopifyConfig
    );

    const store = await storeService.createOrReinstall({
      shopifyDomain: shop,
      shopifyAccessToken: accessToken,
      shopifyScopes: scope,
      name: shop.replace(".myshopify.com", ""),
      email: "",
    });

    request.log.info(
      { storeId: store.id, shopifyDomain: shop },
      "Shopify OAuth completed — store installed"
    );

    return reply.redirect(
      `${env.SHOPIFY_APP_URL}/app?shop=${shop}&installed=true`
    );
  });
}
