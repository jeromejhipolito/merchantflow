import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { ShipmentService } from "../modules/shipment/shipment.service.js";
import { withRetry } from "../lib/retry/index.js";

interface LabelGenerationJobData {
  shipmentId: string;
  storeId: string;
  orderId: string;
  carrier?: string;
}

async function generateLabelViaCarrier(
  _shipmentData: Record<string, unknown>
): Promise<{
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  labelFormat: string;
}> {
  return {
    trackingNumber: `MF${Date.now()}`,
    trackingUrl: `https://track.example.com/MF${Date.now()}`,
    labelUrl: `https://labels.example.com/${Date.now()}.pdf`,
    labelFormat: "PDF",
  };
}

export function createLabelGenerationWorker(
  redis: Redis,
  prisma: PrismaClient
): Worker {
  const shipmentService = new ShipmentService(prisma);

  const worker = new Worker<LabelGenerationJobData>(
    "label-generation",
    async (job: Job<LabelGenerationJobData>) => {
      const { shipmentId, storeId, orderId } = job.data;

      job.log(`Generating label for shipment ${shipmentId}`);

      await shipmentService.transition(storeId, shipmentId, "LABEL_GENERATING");

      try {
        const shipment = await prisma.shipment.findUnique({
          where: { id: shipmentId },
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
          throw new Error(`Shipment ${shipmentId} not found`);
        }

        const labelResult = await withRetry(
          () =>
            generateLabelViaCarrier({
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
                address2: shipment.order.shippingAddressLine2,
                city: shipment.order.shippingCity,
                province: shipment.order.shippingProvince,
                postalCode: shipment.order.shippingPostalCode,
                countryCode: shipment.order.shippingCountryCode,
                phone: shipment.order.shippingPhone,
              },
              customs: {
                value: shipment.customsDeclarationValue,
                currency: shipment.customsCurrency,
              },
            }),
          {
            maxAttempts: 3,
            baseDelayMs: 2000,
            maxDelayMs: 15_000,
            onRetry: (attempt, delay, err) => {
              job.log(
                `Carrier API retry attempt ${attempt} (delay: ${delay}ms): ${err}`
              );
            },
          }
        );

        await shipmentService.transition(storeId, shipmentId, "LABEL_READY", {
          trackingNumber: labelResult.trackingNumber,
          trackingUrl: labelResult.trackingUrl,
          labelUrl: labelResult.labelUrl,
          labelFormat: labelResult.labelFormat,
        });

        job.log(
          `Label generated for shipment ${shipmentId}: ${labelResult.trackingNumber}`
        );

        return { trackingNumber: labelResult.trackingNumber };
      } catch (error) {
        try {
          await shipmentService.transition(storeId, shipmentId, "LABEL_FAILED");
        } catch {
          job.log(`Failed to transition shipment ${shipmentId} to LABEL_FAILED`);
        }
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60_000,
      },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `Label generation job ${job?.id} failed: ${err.message}`
    );
  });

  return worker;
}
