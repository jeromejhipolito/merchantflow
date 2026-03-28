import type { PrismaClient, Order, Prisma } from "@prisma/client";
import { notFound, conflict, AppError, ErrorCode } from "../../lib/errors/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";
import {
  parsePaginationParams,
  buildPrismaPaginationArgs,
  buildPaginatedResponse,
  type PaginatedResponse,
} from "../../lib/pagination/index.js";

export interface UpsertOrderFromShopifyInput {
  storeId: string;
  shopifyOrderId: string;
  orderNumber: string;
  subtotalPrice: string;
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

export class OrderService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFromShopify(input: UpsertOrderFromShopifyInput): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
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

      for (const li of input.lineItems) {
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
        lineItems: true,
      },
      ...paginationArgs,
    });

    return buildPaginatedResponse(orders, pagination.limit);
  }

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
