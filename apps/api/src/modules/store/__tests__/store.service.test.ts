import { describe, it, expect, vi, beforeEach } from "vitest";
import { StoreService, type CreateStoreInput } from "../store.service.js";
import { AppError, ErrorCode } from "../../../lib/errors/index.js";

vi.mock("../../../lib/outbox/index.js", () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/shopify/oauth.js", () => ({
  encryptAccessToken: vi.fn().mockReturnValue("encrypted:token:value"),
  decryptAccessToken: vi.fn().mockReturnValue("shpat_plaintext"),
}));

import { writeOutboxEvent } from "../../../lib/outbox/index.js";
import { encryptAccessToken } from "../../../lib/shopify/oauth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ENCRYPTION_KEY = "a".repeat(64); // 32-byte hex key

function buildPrisma() {
  const inner = {
    store: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    outboxEvent: {
      create: vi.fn(),
    },
  };

  return {
    ...inner,
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(inner)),
  } as any;
}

let prisma: ReturnType<typeof buildPrisma>;

function sampleInput(overrides: Partial<CreateStoreInput> = {}): CreateStoreInput {
  return {
    shopifyDomain: "my-shop.myshopify.com",
    shopifyAccessToken: "shpat_plaintext",
    shopifyScopes: "read_products,write_orders",
    name: "My Shop",
    email: "owner@my-shop.com",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("StoreService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma = buildPrisma();
  });

  // ========================================================================
  // createOrReinstall (install)
  // ========================================================================
  describe("installStore (createOrReinstall — new store)", () => {
    it("should create a new store with encrypted access token", async () => {
      prisma.store.findUnique.mockResolvedValue(null); // no existing store
      prisma.store.create.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
        shopifyAccessToken: "encrypted:token:value",
        status: "ACTIVE",
      });

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      const result = await service.createOrReinstall(sampleInput());

      expect(result.id).toBe("store-1");
      expect(result.status).toBe("ACTIVE");

      // Verify encryption was called with the plaintext token
      expect(encryptAccessToken).toHaveBeenCalledWith("shpat_plaintext", ENCRYPTION_KEY);

      // Verify store.create was called with the encrypted token
      expect(prisma.store.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopifyDomain: "my-shop.myshopify.com",
          shopifyAccessToken: "encrypted:token:value",
          status: "ACTIVE",
        }),
      });
    });

    it("should write a store.installed outbox event for a new store", async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      prisma.store.create.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
      });

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      await service.createOrReinstall(sampleInput());

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: "store-1",
          aggregateType: "Store",
          eventType: "store.installed",
        })
      );
    });
  });

  // ========================================================================
  // createOrReinstall (reinstall)
  // ========================================================================
  describe("installStore (createOrReinstall — reinstall)", () => {
    it("should update existing store on re-install and set status to ACTIVE", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
        status: "UNINSTALLED",
        deletedAt: new Date(),
      });
      prisma.store.update.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
        status: "ACTIVE",
        deletedAt: null,
      });

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      const result = await service.createOrReinstall(sampleInput());

      expect(result.status).toBe("ACTIVE");
      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: "store-1" },
        data: expect.objectContaining({
          shopifyAccessToken: "encrypted:token:value",
          status: "ACTIVE",
          deletedAt: null,
        }),
      });
      // Should NOT call create
      expect(prisma.store.create).not.toHaveBeenCalled();
    });

    it("should write a store.reinstalled outbox event for existing store", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
      });
      prisma.store.update.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
      });

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      await service.createOrReinstall(sampleInput());

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: "store.reinstalled",
        })
      );
    });
  });

  // ========================================================================
  // handleUninstall
  // ========================================================================
  describe("uninstallStore (handleUninstall)", () => {
    it("should soft delete by setting status to UNINSTALLED and revoking token", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
        status: "ACTIVE",
        deletedAt: null,
      });
      prisma.store.update.mockResolvedValue({});

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      await service.handleUninstall("my-shop.myshopify.com");

      // findByDomain calls findUnique, then handleUninstall calls $transaction
      expect(prisma.$transaction).toHaveBeenCalled();

      const updateArgs = prisma.store.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe("UNINSTALLED");
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.shopifyAccessToken).toBe("REVOKED");
    });

    it("should write a store.uninstalled outbox event", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
        status: "ACTIVE",
        deletedAt: null,
      });
      prisma.store.update.mockResolvedValue({});

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      await service.handleUninstall("my-shop.myshopify.com");

      expect(writeOutboxEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: "store-1",
          eventType: "store.uninstalled",
        })
      );
    });
  });

  // ========================================================================
  // findById
  // ========================================================================
  describe("getStore (findById)", () => {
    it("should return store by ID when it exists", async () => {
      const store = {
        id: "store-1",
        shopifyDomain: "my-shop.myshopify.com",
        status: "ACTIVE",
        deletedAt: null,
      };
      prisma.store.findUnique.mockResolvedValue(store);

      const service = new StoreService(prisma, ENCRYPTION_KEY);
      const result = await service.findById("store-1");

      expect(result).toEqual(store);
      expect(prisma.store.findUnique).toHaveBeenCalledWith({
        where: { id: "store-1" },
      });
    });

    it("should throw STORE_NOT_FOUND when store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      const service = new StoreService(prisma, ENCRYPTION_KEY);

      await expect(service.findById("missing")).rejects.toThrow(AppError);
      await expect(service.findById("missing")).rejects.toMatchObject({
        code: ErrorCode.STORE_NOT_FOUND,
      });
    });

    it("should throw STORE_NOT_FOUND when store is soft-deleted", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "store-1",
        deletedAt: new Date(),
      });

      const service = new StoreService(prisma, ENCRYPTION_KEY);

      await expect(service.findById("store-1")).rejects.toMatchObject({
        code: ErrorCode.STORE_NOT_FOUND,
      });
    });
  });
});
