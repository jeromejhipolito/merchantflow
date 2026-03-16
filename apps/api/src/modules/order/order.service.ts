// =============================================================================
// Order Service
// =============================================================================
// Manages the Order aggregate. Orders flow in from two sources:
//
// 1. Shopify webhooks (orders/create, orders/updated) — asynchronous, via BullMQ
// 2. Manual sync (admin triggers a full order sync) — via the sync worker
//
// The Order is the central aggregate in the fulfillment domain. Its lifecycle:
//   UNFULFILLED -> PARTIALLY_FULFILLED -> FULFILLED
//
// Key invariants:
// - An order cannot be fulfilled if financial status is not PAID (or AUTHORIZED)
// - Line item quantities cannot exceed the order's original quantities
// - Fulfillment status transitions are one-directional (no going back to UNFULFILLED)

import type { PrismaClient, Order, Prisma } from "@prisma/client";
import { notFound, conflict, AppError, ErrorCode } from "../../lib/errors/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";
import {
  parsePaginationParams,
  buildPrismaPaginationArgs,
  buildPaginatedResponse,
  type PaginatedResponse,
} from "../../lib/pagination/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertOrderFromShopifyInput {
  storeId: string;
  shopifyOrderId: string;
  orderNumber: string;
  subtotalPrice: string; // Shopify sends strings for money
  totalTax: string;
  totalShipping: string;
  totalDiscount: string;
  totalPrice: string;
  currencyCode: string;
  financialStatus: string;
  fulfillmentStatus: string;
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  shippingAddress?: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    countryCode?: string;
    phone?: string;
  };
  lineItems: Array<{
    shopifyLineItemId: string;
    title: string;
    variantTitle?: string;
    sku?: string;
    quantity: number;
    price: string;
  }>;
  shopifyCreatedAt: string;
}

type OrderWithLineItems = Prisma.OrderGetPayload<{
  include: { lineItems: true };
}>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OrderService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates or updates an order from Shopify webhook/sync data.
   *
   * This is the primary ingestion path. It's idempotent by design:
   * the unique constraint on (storeId, shopifyOrderId) means calling
   * this twice with the same data is safe.
   *
   * Uses an interactive transaction to atomically:
   * 1. Upsert the order
   * 2. Upsert all line items
   * 3. Write an outbox event
   */
  async upsertFromShopify(input: UpsertOrderFromShopifyInput): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      // Upsert the order
      const order = await tx.order.upsert({
        where: {
          uq_store_shopify_order: {
            storeId: input.storeId,
            shopifyOrderId: input.shopifyOrderId,
          },
        },
        create: {
          storeId: input.storeId,
          shopifyOrderId: input.shopifyOrderId,
          orderNumber: input.orderNumber,
          subtotalPrice: input.subtotalPrice,
          totalTax: input.totalTax,
          totalShipping: input.totalShipping,
          totalDiscount: input.totalDiscount,
          totalPrice: input.totalPrice,
          currencyCode: input.currencyCode,
          financialStatus: mapFinancialStatus(input.financialStatus),
          fulfillmentStatus: mapFulfillmentStatus(input.fulfillmentStatus),
          customerEmail: input.customer?.email,
          customerFirstName: input.customer?.firstName,
          customerLastName: input.customer?.lastName,
          customerPhone: input.customer?.phone,
          shippingAddressLine1: input.shippingAddress?.address1,
          shippingAddressLine2: input.shippingAddress?.address2,
          shippingCity: input.shippingAddress?.city,
          shippingProvince: input.shippingAddress?.province,
          shippingPostalCode: input.shippingAddress?.zip,
          shippingCountryCode: input.shippingAddress?.countryCode,
          shippingPhone: input.shippingAddress?.phone,
          shopifyCreatedAt: new Date(input.shopifyCreatedAt),
          shopifySyncedAt: new Date(),
        },
        update: {
          financialStatus: mapFinancialStatus(input.financialStatus),
          fulfillmentStatus: mapFulfillmentStatus(input.fulfillmentStatus),
          customerEmail: input.customer?.email,
          customerFirstName: input.customer?.firstName,
          customerLastName: input.customer?.lastName,
          customerPhone: input.customer?.phone,
          shippingAddressLine1: input.shippingAddress?.address1,
          shippingAddressLine2: input.shippingAddress?.address2,
          shippingCity: input.shippingAddress?.city,
          shippingProvince: input.shippingAddress?.province,
          shippingPostalCode: input.shippingAddress?.zip,
          shippingCountryCode: input.shippingAddress?.countryCode,
          shippingPhone: input.shippingAddress?.phone,
          shopifySyncedAt: new Date(),
        },
      });

      // Upsert line items — Prisma doesn't support bulk upsert in a single
      // call, so we use individual upserts within the transaction.
      // This is fine because line item counts per order are small (< 100).
      for (const li of input.lineItems) {
        // Try to resolve the product by SKU for linking
        let productId: string | null = null;
        if (li.sku) {
          const product = await tx.product.findFirst({
            where: { storeId: input.storeId, sku: li.sku },
            select: { id: true },
          });
          productId = product?.id ?? null;
        }

        await tx.lineItem.upsert({
          where: {
            uq_order_shopify_line_item: {
              orderId: order.id,
              shopifyLineItemId: li.shopifyLineItemId,
            },
          },
          create: {
            orderId: order.id,
            productId,
            shopifyLineItemId: li.shopifyLineItemId,
            title: li.title,
            variantTitle: li.variantTitle,
            sku: li.sku,
            quantity: li.quantity,
            unitPrice: li.price,
            totalPrice: String(Number(li.price) * li.quantity),
          },
          update: {
            productId,
            title: li.title,
            variantTitle: li.variantTitle,
            sku: li.sku,
            quantity: li.quantity,
            unitPrice: li.price,
            totalPrice: String(Number(li.price) * li.quantity),
          },
        });
      }

      // Write outbox event
      await writeOutboxEvent(tx, {
        storeId: input.storeId,
        aggregateType: "Order",
        aggregateId: order.id,
        eventType: "order.synced",
        payload: {
          orderId: order.id,
          shopifyOrderId: input.shopifyOrderId,
          orderNumber: input.orderNumber,
        },
      });

      return order;
    });
  }

  /**
   * Lists orders for a store with cursor pagination.
   * Includes line items eagerly to prevent N+1 on the list page.
   */
  async listByStore(
    storeId: string,
    query: { cursor?: string; limit?: string; fulfillmentStatus?: string }
  ): Promise<PaginatedResponse<OrderWithLineItems>> {
    const pagination = parsePaginationParams(query);
    const paginationArgs = buildPrismaPaginationArgs(pagination);

    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        deletedAt: null,
        ...(query.fulfillmentStatus && {
          fulfillmentStatus: mapFulfillmentStatus(query.fulfillmentStatus),
        }),
      },
      include: {
        lineItems: true, // eager load — prevents N+1
      },
      ...paginationArgs,
    });

    return buildPaginatedResponse(orders, pagination.limit);
  }

  /**
   * Gets a single order by ID, scoped to the store.
   * Includes line items and shipments.
   */
  async getById(storeId: string, orderId: string): Promise<OrderWithLineItems> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId, deletedAt: null },
      include: {
        lineItems: true,
        shipments: true,
      },
    });

    if (!order) throw notFound("Order", orderId);
    return order;
  }
}

// ---------------------------------------------------------------------------
// Status Mappers
// ---------------------------------------------------------------------------
// Shopify sends status as lowercase strings. We map to our enum values.

function mapFinancialStatus(status: string) {
  const map: Record<string, any> = {
    pending: "PENDING",
    authorized: "AUTHORIZED",
    partially_paid: "PARTIALLY_PAID",
    paid: "PAID",
    partially_refunded: "PARTIALLY_REFUNDED",
    refunded: "REFUNDED",
    voided: "VOIDED",
  };
  return map[status.toLowerCase()] ?? "PENDING";
}

function mapFulfillmentStatus(status: string | null | undefined) {
  if (!status) return "UNFULFILLED";
  const map: Record<string, any> = {
    unfulfilled: "UNFULFILLED",
    partial: "PARTIALLY_FULFILLED",
    partially_fulfilled: "PARTIALLY_FULFILLED",
    fulfilled: "FULFILLED",
    restocked: "RESTOCKED",
  };
  return map[status.toLowerCase()] ?? "UNFULFILLED";
}
