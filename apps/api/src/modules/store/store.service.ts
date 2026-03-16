// =============================================================================
// Store Service
// =============================================================================
// Manages the Store aggregate. Handles:
// - OAuth installation (creating a store from Shopify OAuth callback)
// - Store lookup by domain
// - Store suspension / uninstallation
//
// The Store is the tenant root. All other services receive a storeId
// parameter — they never query without one.

import type { PrismaClient, Store } from "@prisma/client";
import { encryptAccessToken, decryptAccessToken } from "../../lib/shopify/oauth.js";
import { notFound, conflict } from "../../lib/errors/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

export interface CreateStoreInput {
  shopifyDomain: string;
  shopifyAccessToken: string; // plaintext — will be encrypted before storage
  shopifyScopes: string;
  name: string;
  email: string;
  currency?: string;
  timezone?: string;
}

export class StoreService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryptionKey: string
  ) {}

  /**
   * Creates a store from a Shopify OAuth callback.
   * Called after successfully exchanging the OAuth code for an access token.
   *
   * Uses a transaction to atomically create the store AND write an outbox event.
   * If the store already exists (re-install), we update the token instead.
   */
  async createOrReinstall(input: CreateStoreInput): Promise<Store> {
    const encryptedToken = encryptAccessToken(
      input.shopifyAccessToken,
      this.encryptionKey
    );

    return this.prisma.$transaction(async (tx) => {
      // Check for existing store (re-installation scenario)
      const existing = await tx.store.findUnique({
        where: { shopifyDomain: input.shopifyDomain },
      });

      if (existing) {
        // Re-install: update token and reactivate
        const updated = await tx.store.update({
          where: { id: existing.id },
          data: {
            shopifyAccessToken: encryptedToken,
            shopifyScopes: input.shopifyScopes,
            status: "ACTIVE",
            deletedAt: null,
          },
        });

        await writeOutboxEvent(tx, {
          storeId: updated.id,
          aggregateType: "Store",
          aggregateId: updated.id,
          eventType: "store.reinstalled",
          payload: { shopifyDomain: updated.shopifyDomain },
        });

        return updated;
      }

      // New installation
      const store = await tx.store.create({
        data: {
          shopifyDomain: input.shopifyDomain,
          shopifyAccessToken: encryptedToken,
          shopifyScopes: input.shopifyScopes,
          name: input.name,
          email: input.email,
          currency: input.currency ?? "USD",
          timezone: input.timezone ?? "UTC",
          status: "ACTIVE",
        },
      });

      await writeOutboxEvent(tx, {
        storeId: store.id,
        aggregateType: "Store",
        aggregateId: store.id,
        eventType: "store.installed",
        payload: { shopifyDomain: store.shopifyDomain },
      });

      return store;
    });
  }

  async findById(id: string): Promise<Store> {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store || store.deletedAt) throw notFound("Store", id);
    return store;
  }

  async findByDomain(shopifyDomain: string): Promise<Store> {
    const store = await this.prisma.store.findUnique({
      where: { shopifyDomain },
    });
    if (!store || store.deletedAt) throw notFound("Store", shopifyDomain);
    return store;
  }

  /**
   * Returns the decrypted access token for making Shopify API calls.
   * This should NEVER be exposed via API — only used internally by services.
   */
  getDecryptedAccessToken(store: Store): string {
    return decryptAccessToken(store.shopifyAccessToken, this.encryptionKey);
  }

  /**
   * Handles Shopify app/uninstalled webhook.
   * Soft-deletes the store and writes an outbox event.
   */
  async handleUninstall(shopifyDomain: string): Promise<void> {
    const store = await this.findByDomain(shopifyDomain);

    await this.prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: store.id },
        data: {
          status: "UNINSTALLED",
          deletedAt: new Date(),
          shopifyAccessToken: "REVOKED", // clear the token
        },
      });

      await writeOutboxEvent(tx, {
        storeId: store.id,
        aggregateType: "Store",
        aggregateId: store.id,
        eventType: "store.uninstalled",
        payload: { shopifyDomain },
      });
    });
  }
}
