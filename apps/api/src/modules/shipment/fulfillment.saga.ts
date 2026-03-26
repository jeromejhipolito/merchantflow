// =============================================================================
// Fulfillment Saga
// =============================================================================
// Orchestrates the full shipment creation pipeline triggered when a merchant
// creates a shipment via the API.
//
// Steps:
//   1. ValidateOrder    — Check order exists, is PAID/AUTHORIZED, unfulfilled items
//   2. CreateShipment   — Create shipment record in PENDING state
//   3. GenerateLabel    — Call carrier API to generate shipping label
//   4. UpdateOrderStatus — Update order fulfillment_status
//   5. PushToShopify    — Push fulfillment data to Shopify Admin API
//   6. NotifyMerchant   — Deliver "shipment.created" outbox event
//
// Compensation:
//   - ValidateOrder: no-op
//   - CreateShipment: delete the shipment record
//   - GenerateLabel: void the label (mark shipment as LABEL_FAILED)
//   - UpdateOrderStatus: revert to previous fulfillment status
//   - PushToShopify: no-op (best-effort)
//   - NotifyMerchant: no-op (best-effort)

import type { PrismaClient, OrderFulfillmentStatus } from "@prisma/client";
import type { SagaDefinition, SagaStepDefinition } from "../../lib/saga/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

// ---------------------------------------------------------------------------
// Context Type
// ---------------------------------------------------------------------------

export interface FulfillmentContext extends Record<string, unknown> {
  // --- Input (provided at saga start) ---
  storeId: string;
  orderId: string;
  carrier?: string;
  service?: string;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  customsDeclarationValue?: number;
  customsCurrency?: string;

  // --- Added by ValidateOrder ---
  orderNumber?: string;
  previousFulfillmentStatus?: string;

  // --- Added by CreateShipment ---
  shipmentId?: string;

  // --- Added by GenerateLabel ---
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  labelFormat?: string;

  // --- Added by UpdateOrderStatus ---
  newFulfillmentStatus?: string;

  // --- Added by PushToShopify ---
  shopifyFulfillmentId?: string;
}

// ---------------------------------------------------------------------------
// Carrier API Stub
// ---------------------------------------------------------------------------

/**
 * Stub carrier API client. In production, this would be a DHL/FedEx/UPS SDK.
 * Isolated here so it can be replaced with a real implementation without
 * changing the saga structure.
 */
async function generateLabelViaCarrier(
  _shipmentData: Record<string, unknown>
): Promise<{
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  labelFormat: string;
  externalShipmentId: string;
}> {
  // STUB: replace with actual carrier SDK integration
  const trackingNum = `MF${Date.now()}`;
  return {
    trackingNumber: trackingNum,
    trackingUrl: `https://track.example.com/${trackingNum}`,
    labelUrl: `https://labels.example.com/${Date.now()}.pdf`,
    labelFormat: "PDF",
    externalShipmentId: `ext_${Date.now()}`,
  };
}

/**
 * Stub: void a label via the carrier API.
 */
async function voidLabelViaCarrier(
  _externalShipmentId: string
): Promise<void> {
  // STUB: replace with actual carrier SDK void call
}

/**
 * Stub: push fulfillment to Shopify Admin API.
 */
async function pushFulfillmentToShopify(
  _storeId: string,
  _orderId: string,
  _trackingNumber: string,
  _trackingUrl: string
): Promise<string> {
  // STUB: replace with actual Shopify Admin API call
  // Returns the Shopify fulfillment ID
  return `shopify_ful_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Step Factory
// ---------------------------------------------------------------------------

/**
 * Creates the fulfillment saga definition with steps that close over
 * the PrismaClient.
 */
export function createFulfillmentSaga(
  prisma: PrismaClient
): SagaDefinition<FulfillmentContext> {
  return {
    type: "FULFILLMENT",
    steps: [
      createValidateOrderStep(prisma),
      createCreateShipmentStep(prisma),
      createGenerateLabelStep(prisma),
      createUpdateOrderStatusStep(prisma),
      createPushToShopifyStep(),
      createNotifyMerchantStep(prisma),
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 1: ValidateOrder
// ---------------------------------------------------------------------------

function createValidateOrderStep(
  prisma: PrismaClient
): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "ValidateOrder",
    maxRetries: 1,
    async execute(context) {
      const order = await prisma.order.findFirst({
        where: {
          id: context.orderId,
          storeId: context.storeId,
          deletedAt: null,
        },
        include: { lineItems: true, shipments: true },
      });

      if (!order) {
        throw new Error(`Order not found: ${context.orderId}`);
      }

      // Business rule: order must be paid/authorized
      if (!["PAID", "AUTHORIZED"].includes(order.financialStatus)) {
        throw new Error(
          `Cannot create shipment for order ${order.orderNumber}: ` +
            `financial status is ${order.financialStatus}. Must be PAID or AUTHORIZED.`
        );
      }

      // Business rule: cannot fulfill if already fully fulfilled
      if (order.fulfillmentStatus === "FULFILLED") {
        throw new Error(
          `Order ${order.orderNumber} is already fully fulfilled.`
        );
      }

      return {
        orderNumber: order.orderNumber,
        previousFulfillmentStatus: order.fulfillmentStatus,
      };
    },
    // No compensate — validation has no side effects
  };
}

// ---------------------------------------------------------------------------
// Step 2: CreateShipment
// ---------------------------------------------------------------------------

function createCreateShipmentStep(
  prisma: PrismaClient
): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "CreateShipment",
    maxRetries: 3,
    async execute(context) {
      const shipment = await prisma.shipment.create({
        data: {
          storeId: context.storeId,
          orderId: context.orderId,
          carrier: context.carrier,
          service: context.service,
          status: "PENDING",
          weightGrams: context.weightGrams,
          lengthCm: context.lengthCm,
          widthCm: context.widthCm,
          heightCm: context.heightCm,
          customsDeclarationValue: context.customsDeclarationValue,
          customsCurrency: context.customsCurrency,
        },
      });

      return { shipmentId: shipment.id };
    },
    async compensate(context) {
      if (!context.shipmentId) return;

      // Delete the shipment — it was just created and has no downstream references
      await prisma.shipment.delete({
        where: { id: context.shipmentId },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Step 3: GenerateLabel
// ---------------------------------------------------------------------------

function createGenerateLabelStep(
  prisma: PrismaClient
): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "GenerateLabel",
    maxRetries: 3,
    async execute(context) {
      if (!context.shipmentId) {
        throw new Error("Cannot generate label: shipmentId missing from context");
      }

      // Transition to LABEL_GENERATING
      await prisma.shipment.update({
        where: { id: context.shipmentId },
        data: { status: "LABEL_GENERATING" },
      });

      // Fetch full shipment + order details for the carrier API
      const shipment = await prisma.shipment.findUnique({
        where: { id: context.shipmentId },
        include: {
          order: {
            select: {
              shippingAddressLine1: true,
              shippingAddressLine2: true,
              shippingCity: true,
              shippingProvince: true,
              shippingPostalCode: true,
              shippingCountryCode: true,
              shippingPhone: true,
              customerFirstName: true,
              customerLastName: true,
            },
          },
        },
      });

      if (!shipment) {
        throw new Error(`Shipment ${context.shipmentId} not found`);
      }

      // Call carrier API
      const labelResult = await generateLabelViaCarrier({
        carrier: shipment.carrier,
        service: shipment.service,
        weight: shipment.weightGrams,
        dimensions: {
          length: shipment.lengthCm,
          width: shipment.widthCm,
          height: shipment.heightCm,
        },
        destination: {
          name: `${shipment.order.customerFirstName} ${shipment.order.customerLastName}`,
          address1: shipment.order.shippingAddressLine1,
          city: shipment.order.shippingCity,
          province: shipment.order.shippingProvince,
          postalCode: shipment.order.shippingPostalCode,
          countryCode: shipment.order.shippingCountryCode,
        },
        customs: {
          value: shipment.customsDeclarationValue,
          currency: shipment.customsCurrency,
        },
      });

      // Transition to LABEL_READY with tracking info
      await prisma.shipment.update({
        where: { id: context.shipmentId },
        data: {
          status: "LABEL_READY",
          trackingNumber: labelResult.trackingNumber,
          trackingUrl: labelResult.trackingUrl,
          labelUrl: labelResult.labelUrl,
          labelFormat: labelResult.labelFormat,
          labelGeneratedAt: new Date(),
          externalShipmentId: labelResult.externalShipmentId,
        },
      });

      return {
        trackingNumber: labelResult.trackingNumber,
        trackingUrl: labelResult.trackingUrl,
        labelUrl: labelResult.labelUrl,
        labelFormat: labelResult.labelFormat,
      };
    },
    async compensate(context) {
      if (!context.shipmentId) return;

      // Void the label via carrier API (best-effort)
      const shipment = await prisma.shipment.findUnique({
        where: { id: context.shipmentId },
        select: { externalShipmentId: true },
      });

      if (shipment?.externalShipmentId) {
        try {
          await voidLabelViaCarrier(shipment.externalShipmentId);
        } catch {
          // Log but don't fail compensation — voiding is best-effort
        }
      }

      // Revert shipment status to LABEL_FAILED
      await prisma.shipment.update({
        where: { id: context.shipmentId },
        data: { status: "LABEL_FAILED" },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Step 4: UpdateOrderStatus
// ---------------------------------------------------------------------------

function createUpdateOrderStatusStep(
  prisma: PrismaClient
): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "UpdateOrderStatus",
    maxRetries: 3,
    async execute(context) {
      // Determine the new fulfillment status based on existing shipments
      const order = await prisma.order.findUnique({
        where: { id: context.orderId },
        include: {
          lineItems: true,
          shipments: { where: { status: { notIn: ["FAILED", "RETURNED"] } } },
        },
      });

      if (!order) {
        throw new Error(`Order ${context.orderId} not found`);
      }

      // Calculate total fulfilled quantity across all active shipments.
      // For now, each shipment fulfills all remaining items (simplified).
      // A full implementation would track per-line-item fulfillment quantities.
      const activeShipmentCount = order.shipments.length;
      const newStatus: OrderFulfillmentStatus =
        activeShipmentCount >= 1 ? "PARTIALLY_FULFILLED" : "UNFULFILLED";

      // If all line items are accounted for, mark as FULFILLED
      // For simplicity: if there's at least one shipment with a label, it's partial.
      // With two+ shipments, consider it fully fulfilled.
      const labelReadyOrBetter = order.shipments.filter((s) =>
        ["LABEL_READY", "SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(s.status)
      );

      const finalStatus: OrderFulfillmentStatus =
        labelReadyOrBetter.length > 0 ? "PARTIALLY_FULFILLED" : newStatus;

      await prisma.order.update({
        where: { id: context.orderId },
        data: { fulfillmentStatus: finalStatus },
      });

      return { newFulfillmentStatus: finalStatus };
    },
    async compensate(context) {
      if (!context.previousFulfillmentStatus) return;

      // Revert to the previous fulfillment status
      await prisma.order.update({
        where: { id: context.orderId },
        data: {
          fulfillmentStatus: context.previousFulfillmentStatus as any,
        },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Step 5: PushToShopify
// ---------------------------------------------------------------------------

function createPushToShopifyStep(): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "PushToShopify",
    maxRetries: 3,
    async execute(context) {
      // Push fulfillment data to Shopify Admin API
      const shopifyFulfillmentId = await pushFulfillmentToShopify(
        context.storeId,
        context.orderId,
        context.trackingNumber ?? "",
        context.trackingUrl ?? ""
      );

      return { shopifyFulfillmentId };
    },
    // No compensate — Shopify push is best-effort.
    // If we need to void, the merchant can do it manually in Shopify.
  };
}

// ---------------------------------------------------------------------------
// Step 6: NotifyMerchant
// ---------------------------------------------------------------------------

function createNotifyMerchantStep(
  prisma: PrismaClient
): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "NotifyMerchant",
    maxRetries: 2,
    async execute(context) {
      if (!context.shipmentId) return {};

      await prisma.$transaction(async (tx) => {
        await writeOutboxEvent(tx, {
          storeId: context.storeId,
          aggregateType: "Shipment",
          aggregateId: context.shipmentId!,
          eventType: "shipment.created",
          payload: {
            shipmentId: context.shipmentId,
            orderId: context.orderId,
            trackingNumber: context.trackingNumber,
            trackingUrl: context.trackingUrl,
            carrier: context.carrier,
            orderNumber: context.orderNumber,
          },
        });
      });

      return {};
    },
    // No compensate — webhook delivery is best-effort
  };
}
