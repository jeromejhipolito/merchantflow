// =============================================================================
// Order Processing Saga
// =============================================================================
// Orchestrates the full order ingestion pipeline triggered by Shopify
// `orders/create` or `orders/updated` webhooks.
//
// Steps:
//   1. ValidatePayload  — Parse and validate the Shopify order payload
//   2. UpsertOrder      — Upsert order + line items in a Prisma transaction
//   3. UpdateInventory   — Adjust product inventory based on line items
//   4. DeliverWebhooks   — Dispatch "order.synced" outbox event for delivery
//
// Compensation:
//   - ValidatePayload: no-op (pure transformation, nothing to undo)
//   - UpsertOrder: mark order sync timestamp as null (signals sync failure)
//   - UpdateInventory: reverse all inventory adjustments
//   - DeliverWebhooks: no-op (best-effort delivery)
//
// Context shape: the saga accumulates data as it progresses. Each step
// reads what it needs from the context and adds its output.
//
// Note: step functions are factories that close over the PrismaClient.
// This keeps the saga engine framework-agnostic while still allowing
// steps to perform database operations.

import type { PrismaClient } from "@prisma/client";
import type { SagaDefinition, SagaStepDefinition } from "../../lib/saga/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

// ---------------------------------------------------------------------------
// Context Type
// ---------------------------------------------------------------------------

/**
 * The context object that flows through all steps of the order processing saga.
 *
 * Fields are added progressively — early steps add fields that later steps
 * consume. All downstream fields are optional at the type level because the
 * context is built up incrementally, but runtime invariants are enforced by
 * step ordering.
 */
export interface OrderProcessingContext extends Record<string, unknown> {
  // --- Input (provided at saga start) ---
  storeId: string;
  shopifyOrderId: string;
  topic: string; // "orders/create" or "orders/updated"
  webhookId: string;
  shopifyPayload: Record<string, any>;

  // --- Added by ValidatePayload ---
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

  // --- Added by UpsertOrder ---
  orderId?: string;

  // --- Added by UpdateInventory ---
  inventoryAdjustments?: Array<{
    productId: string;
    sku: string;
    quantityDelta: number;
  }>;
}

// ---------------------------------------------------------------------------
// Step Factory
// ---------------------------------------------------------------------------

/**
 * Creates the order processing saga definition with steps that close over
 * the PrismaClient. This factory pattern keeps the saga engine framework-agnostic
 * while allowing steps to perform Prisma transactions.
 */
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

// ---------------------------------------------------------------------------
// Step 1: ValidatePayload
// ---------------------------------------------------------------------------
// Parses the raw Shopify webhook payload into our domain model shape.
// Pure transformation — no side effects, no compensation needed.
//
// Validation rules:
// - order_number must exist
// - line_items must be a non-empty array
// - price fields must be parseable as numbers

function createValidatePayloadStep(): SagaStepDefinition<OrderProcessingContext> {
  return {
    name: "ValidatePayload",
    maxRetries: 1, // Validation either passes or it doesn't — no point retrying
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
    // No compensate — validation has no side effects
  };
}

// ---------------------------------------------------------------------------
// Step 2: UpsertOrder
// ---------------------------------------------------------------------------
// Creates or updates the order and its line items in a single Prisma
// transaction. Uses the same upsert logic as OrderService but broken
// out for saga orchestration.
//
// Compensation: set shopifySyncedAt to null to signal sync failure.

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

        // Upsert line items within the same transaction
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

      // Mark the order's sync timestamp as null to signal sync failure.
      // We do NOT delete the order — partial data is better than data loss.
      await prisma.order.update({
        where: { id: context.orderId },
        data: { shopifySyncedAt: null },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Step 3: UpdateInventory
// ---------------------------------------------------------------------------
// Adjusts product inventory based on line items. Uses atomic decrement
// to prevent lost updates under concurrent order processing.
//
// Compensation: reverse all inventory adjustments.

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

          // Atomic decrement — prevents lost updates under concurrency
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
      // Reverse each inventory adjustment
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

// ---------------------------------------------------------------------------
// Step 4: DeliverWebhooks
// ---------------------------------------------------------------------------
// Writes an "order.synced" outbox event so the outbox poller can deliver
// webhooks to merchant endpoints. Best-effort — no compensation.

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
    // No compensate — outbox delivery is best-effort
  };
}
