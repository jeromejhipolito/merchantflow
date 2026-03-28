import type { PrismaClient, OrderFulfillmentStatus } from "@prisma/client";
import type { SagaDefinition, SagaStepDefinition } from "../../lib/saga/index.js";
import { writeOutboxEvent } from "../../lib/outbox/index.js";

export interface FulfillmentContext extends Record<string, unknown> {
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

  orderNumber?: string;
  previousFulfillmentStatus?: string;
  shipmentId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  labelFormat?: string;

  newFulfillmentStatus?: string;
  shopifyFulfillmentId?: string;
}

// Carrier API stubs (replace with real SDK)
async function generateLabelViaCarrier(
  _shipmentData: Record<string, unknown>
): Promise<{
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  labelFormat: string;
  externalShipmentId: string;
}> {
  const trackingNum = `MF${Date.now()}`;
  return {
    trackingNumber: trackingNum,
    trackingUrl: `https://track.example.com/${trackingNum}`,
    labelUrl: `https://labels.example.com/${Date.now()}.pdf`,
    labelFormat: "PDF",
    externalShipmentId: `ext_${Date.now()}`,
  };
}

async function voidLabelViaCarrier(
  _externalShipmentId: string
): Promise<void> {}

async function pushFulfillmentToShopify(
  _storeId: string,
  _orderId: string,
  _trackingNumber: string,
  _trackingUrl: string
): Promise<string> {
  return `shopify_ful_${Date.now()}`;
}

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

      if (!["PAID", "AUTHORIZED"].includes(order.financialStatus)) {
        throw new Error(
          `Cannot create shipment for order ${order.orderNumber}: ` +
            `financial status is ${order.financialStatus}. Must be PAID or AUTHORIZED.`
        );
      }

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
  };
}

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

      await prisma.shipment.delete({
        where: { id: context.shipmentId },
      });
    },
  };
}

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

      await prisma.shipment.update({
        where: { id: context.shipmentId },
        data: { status: "LABEL_GENERATING" },
      });

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

      const shipment = await prisma.shipment.findUnique({
        where: { id: context.shipmentId },
        select: { externalShipmentId: true },
      });

      if (shipment?.externalShipmentId) {
        try {
          await voidLabelViaCarrier(shipment.externalShipmentId);
        } catch {
          // best-effort void
        }
      }

      await prisma.shipment.update({
        where: { id: context.shipmentId },
        data: { status: "LABEL_FAILED" },
      });
    },
  };
}

function createUpdateOrderStatusStep(
  prisma: PrismaClient
): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "UpdateOrderStatus",
    maxRetries: 3,
    async execute(context) {
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

      const activeShipmentCount = order.shipments.length;
      const newStatus: OrderFulfillmentStatus =
        activeShipmentCount >= 1 ? "PARTIALLY_FULFILLED" : "UNFULFILLED";

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

      await prisma.order.update({
        where: { id: context.orderId },
        data: {
          fulfillmentStatus: context.previousFulfillmentStatus as any,
        },
      });
    },
  };
}

function createPushToShopifyStep(): SagaStepDefinition<FulfillmentContext> {
  return {
    name: "PushToShopify",
    maxRetries: 3,
    async execute(context) {
      const shopifyFulfillmentId = await pushFulfillmentToShopify(
        context.storeId,
        context.orderId,
        context.trackingNumber ?? "",
        context.trackingUrl ?? ""
      );

      return { shopifyFulfillmentId };
    },
  };
}

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
  };
}
