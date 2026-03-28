import type { PrismaClient, Store } from "@prisma/client";
import { encryptAccessToken, decryptAccessToken } from "../../lib/shopify/oauth.js";
import { notFound, conflict } from "../../lib/errors/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

export interface CreateStoreInput {
  shopifyDomain: string;
  shopifyAccessToken: string;
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

  async createOrReinstall(input: CreateStoreInput): Promise<Store> {
    const encryptedToken = encryptAccessToken(
      input.shopifyAccessToken,
      this.encryptionKey
    );

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.store.findUnique({
        where: { shopifyDomain: input.shopifyDomain },
      });

      if (existing) {
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

  getDecryptedAccessToken(store: Store): string {
    return decryptAccessToken(store.shopifyAccessToken, this.encryptionKey);
  }

  async handleUninstall(shopifyDomain: string): Promise<void> {
    const store = await this.findByDomain(shopifyDomain);

    await this.prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: store.id },
        data: {
          status: "UNINSTALLED",
          deletedAt: new Date(),
          shopifyAccessToken: "REVOKED",
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
