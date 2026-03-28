import type { PrismaClient } from "@prisma/client";
import type { SagaDefinition, SagaStepDefinition } from "../../lib/saga/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

export interface OrderProcessingContext extends Record<string, unknown> {
  storeId: string;
  shopifyOrderId: string;
  topic: string;
  webhookId: string;
  shopifyPayload: Record<string, any>;

  orderNumber?: string;
  subtotalPrice?: string;
  totalTax?: string;
  totalShipping?: string;
  totalDiscount?: string;
  totalPrice?: string;
  currencyCode?: string;
  financialStatus?: string;
  fulfillmentStatus?: string | null;
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
  lineItems?: Array<{
    shopifyLineItemId: string;
    title: string;
    variantTitle?: string;
    sku?: string;
    quantity: number;
    price: string;
  }>;
  shopifyCreatedAt?: string;

  orderId?: string;
  inventoryAdjustments?: Array<{
    productId: string;
    sku: string;
    quantityDelta: number;
  }>;
}

export function createOrderProcessingSaga(
  prisma: PrismaClient
): SagaDefinition<OrderProcessingContext> {
  return {
    type: "ORDER_PROCESSING",
    steps: [
      createValidatePayloadStep(),
      createUpsertOrderStep(prisma),
      createUpdateInventoryStep(prisma),
      createDeliverWebhooksStep(prisma),
    ],
  };
}

function createValidatePayloadStep(): SagaStepDefinition<OrderProcessingContext> {
  return {
    name: "ValidatePayload",
    maxRetries: 1,
    async execute(context) {
      const p = context.shopifyPayload;

      const orderNumber = String(p.order_number ?? p.name);
      if (!orderNumber) {
        throw new Error("Shopify payload missing order_number");
      }

      const rawLineItems = p.line_items;
      if (!Array.isArray(rawLineItems) || rawLineItems.length === 0) {
        throw new Error("Shopify payload has no line items");
      }

      return {
        orderNumber,
        subtotalPrice: String(p.subtotal_price ?? "0"),
        totalTax: String(p.total_tax ?? "0"),
        totalShipping: String(
          p.total_shipping_price_set?.shop_money?.amount ?? "0"
        ),
        totalDiscount: String(p.total_discounts ?? "0"),
        totalPrice: String(p.total_price ?? "0"),
        currencyCode: p.currency ?? "USD",
        financialStatus: p.financial_status ?? "pending",
        fulfillmentStatus: p.fulfillment_status ?? null,
        customer: p.customer
          ? {
              email: p.customer.email,
              firstName: p.customer.first_name,
              lastName: p.customer.last_name,
              phone: p.customer.phone,
            }
          : undefined,
        shippingAddress: p.shipping_address
          ? {
              address1: p.shipping_address.address1,
              address2: p.shipping_address.address2,
              city: p.shipping_address.city,
              province: p.shipping_address.province,
              zip: p.shipping_address.zip,
              countryCode: p.shipping_address.country_code,
              phone: p.shipping_address.phone,
            }
          : undefined,
        lineItems: rawLineItems.map((li: any) => ({
          shopifyLineItemId: String(li.id),
          title: li.title,
          variantTitle: li.variant_title,
          sku: li.sku,
          quantity: li.quantity,
          price: String(li.price),
        })),
        shopifyCreatedAt: p.created_at,
      };
    },
  };
}

function createUpsertOrderStep(
  prisma: PrismaClient
): SagaStepDefinition<OrderProcessingContext> {
  const financialStatusMap: Record<string, string> = {
    pending: "PENDING",
    authorized: "AUTHORIZED",
    partially_paid: "PARTIALLY_PAID",
    paid: "PAID",
    partially_refunded: "PARTIALLY_REFUNDED",
    refunded: "REFUNDED",
    voided: "VOIDED",
  };

  const fulfillmentStatusMap: Record<string, string> = {
    unfulfilled: "UNFULFILLED",
    partial: "PARTIALLY_FULFILLED",
    partially_fulfilled: "PARTIALLY_FULFILLED",
    fulfilled: "FULFILLED",
    restocked: "RESTOCKED",
  };

  return {
    name: "UpsertOrder",
    maxRetries: 3,
    async execute(context) {
      const financialStatus =
        financialStatusMap[context.financialStatus?.toLowerCase() ?? "pending"] ??
        "PENDING";

      const fulfillmentStatus = context.fulfillmentStatus
        ? (fulfillmentStatusMap[context.fulfillmentStatus.toLowerCase()] ??
            "UNFULFILLED")
        : "UNFULFILLED";

      return prisma.$transaction(async (tx) => {
        const order = await tx.order.upsert({
          where: {
            uq_store_shopify_order: {
              storeId: context.storeId,
              shopifyOrderId: context.shopifyOrderId,
            },
          },
          create: {
            storeId: context.storeId,
            shopifyOrderId: context.shopifyOrderId,
            orderNumber: context.orderNumber!,
            subtotalPrice: context.subtotalPrice!,
            totalTax: context.totalTax!,
            totalShipping: context.totalShipping!,
            totalDiscount: context.totalDiscount!,
            totalPrice: context.totalPrice!,
            currencyCode: context.currencyCode!,
            financialStatus: financialStatus as any,
            fulfillmentStatus: fulfillmentStatus as any,
            customerEmail: context.customer?.email,
            customerFirstName: context.customer?.firstName,
            customerLastName: context.customer?.lastName,
            customerPhone: context.customer?.phone,
            shippingAddressLine1: context.shippingAddress?.address1,
            shippingAddressLine2: context.shippingAddress?.address2,
            shippingCity: context.shippingAddress?.city,
            shippingProvince: context.shippingAddress?.province,
            shippingPostalCode: context.shippingAddress?.zip,
            shippingCountryCode: context.shippingAddress?.countryCode,
            shippingPhone: context.shippingAddress?.phone,
            shopifyCreatedAt: context.shopifyCreatedAt
              ? new Date(context.shopifyCreatedAt)
              : undefined,
            shopifySyncedAt: new Date(),
          },
          update: {
            financialStatus: financialStatus as any,
            fulfillmentStatus: fulfillmentStatus as any,
            customerEmail: context.customer?.email,
            customerFirstName: context.customer?.firstName,
            customerLastName: context.customer?.lastName,
            customerPhone: context.customer?.phone,
            shippingAddressLine1: context.shippingAddress?.address1,
            shippingAddressLine2: context.shippingAddress?.address2,
            shippingCity: context.shippingAddress?.city,
            shippingProvince: context.shippingAddress?.province,
            shippingPostalCode: context.shippingAddress?.zip,
            shippingCountryCode: context.shippingAddress?.countryCode,
            shippingPhone: context.shippingAddress?.phone,
            shopifySyncedAt: new Date(),
          },
        });

        for (const li of context.lineItems ?? []) {
          let productId: string | null = null;
          if (li.sku) {
            const product = await tx.product.findFirst({
              where: { storeId: context.storeId, sku: li.sku },
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

        return { orderId: order.id };
      });
    },
    async compensate(context) {
      if (!context.orderId) return;

      await prisma.order.update({
        where: { id: context.orderId },
        data: { shopifySyncedAt: null },
      });
    },
  };
}

function createUpdateInventoryStep(
  prisma: PrismaClient
): SagaStepDefinition<OrderProcessingContext> {
  return {
    name: "UpdateInventory",
    maxRetries: 3,
    async execute(context) {
      const adjustments: Array<{
        productId: string;
        sku: string;
        quantityDelta: number;
      }> = [];

      await prisma.$transaction(async (tx) => {
        for (const li of context.lineItems ?? []) {
          if (!li.sku) continue;

          const product = await tx.product.findFirst({
            where: { storeId: context.storeId, sku: li.sku },
            select: { id: true, sku: true },
          });

          if (!product) continue;

          await tx.product.update({
            where: { id: product.id },
            data: { inventoryQuantity: { decrement: li.quantity } },
          });

          adjustments.push({
            productId: product.id,
            sku: product.sku ?? li.sku,
            quantityDelta: -li.quantity,
          });
        }
      });

      return { inventoryAdjustments: adjustments };
    },
    async compensate(context) {
      await prisma.$transaction(async (tx) => {
        for (const adj of context.inventoryAdjustments ?? []) {
          await tx.product.update({
            where: { id: adj.productId },
            data: {
              inventoryQuantity: { increment: Math.abs(adj.quantityDelta) },
            },
          });
        }
      });
    },
  };
}

function createDeliverWebhooksStep(
  prisma: PrismaClient
): SagaStepDefinition<OrderProcessingContext> {
  return {
    name: "DeliverWebhooks",
    maxRetries: 2,
    async execute(context) {
      if (!context.orderId) return {};

      await prisma.$transaction(async (tx) => {
        await writeOutboxEvent(tx, {
          storeId: context.storeId,
          aggregateType: "Order",
          aggregateId: context.orderId!,
          eventType: "order.synced",
          payload: {
            orderId: context.orderId,
            shopifyOrderId: context.shopifyOrderId,
            orderNumber: context.orderNumber,
            topic: context.topic,
          },
        });
      });

      return {};
    },
  };
}
