import type { FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./health.routes.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerShopifyWebhookRoutes } from "./shopify-webhook.routes.js";
import { registerOrderRoutes } from "./order.routes.js";
import { registerShipmentRoutes } from "./shipment.routes.js";
import { registerWebhookRoutes } from "./webhook.routes.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes, { prefix: "/auth" });
  await app.register(registerShopifyWebhookRoutes, { prefix: "/webhooks" });

  await app.register(
    async (api) => {
      await api.register(registerOrderRoutes, { prefix: "/orders" });
      await api.register(registerShipmentRoutes, { prefix: "/shipments" });
      await api.register(registerWebhookRoutes, { prefix: "/webhooks" });
    },
    { prefix: "/api/v1" }
  );
}
