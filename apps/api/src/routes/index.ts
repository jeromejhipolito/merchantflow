// =============================================================================
// Route Registration
// =============================================================================
// All routes are registered here. Fastify plugin pattern ensures proper
// encapsulation — each route file is a Fastify plugin.
//
// Route hierarchy:
//   /health                          — Health check (public)
//   /auth/shopify                    — Shopify OAuth initiation (public)
//   /auth/shopify/callback           — Shopify OAuth callback (public)
//   /webhooks/shopify                — Inbound Shopify webhooks (HMAC auth)
//   /api/v1/orders                   — Order CRUD (API key auth)
//   /api/v1/orders/:orderId/shipments — Shipment management (API key auth)
//   /api/v1/products                 — Product listing (API key auth)
//   /api/v1/shipments                — Shipment queries (API key auth)
//   /api/v1/webhooks                 — Webhook endpoint management (API key auth)

import type { FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./health.routes.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerShopifyWebhookRoutes } from "./shopify-webhook.routes.js";
import { registerOrderRoutes } from "./order.routes.js";
import { registerShipmentRoutes } from "./shipment.routes.js";
import { registerWebhookRoutes } from "./webhook.routes.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Public routes (no auth)
  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes, { prefix: "/auth" });
  await app.register(registerShopifyWebhookRoutes, { prefix: "/webhooks" });

  // Authenticated API routes (v1)
  await app.register(
    async (api) => {
      await api.register(registerOrderRoutes, { prefix: "/orders" });
      await api.register(registerShipmentRoutes, { prefix: "/shipments" });
      await api.register(registerWebhookRoutes, { prefix: "/webhooks" });
    },
    { prefix: "/api/v1" }
  );
}
