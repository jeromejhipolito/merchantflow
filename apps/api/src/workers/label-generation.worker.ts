// =============================================================================
// Label Generation Worker
// =============================================================================
// Generates shipping labels via carrier APIs. This is intentionally async
// because carrier APIs are slow (2-15 seconds) and unreliable.
//
// Job payload:
//   { shipmentId, storeId, orderId, carrier }
//
// Processing:
// 1. Look up shipment + order + shipping address
// 2. Transition shipment to LABEL_GENERATING
// 3. Call the carrier API (stubbed — this is where DHL/FedEx/etc. integration goes)
// 4. On success: store label URL, transition to LABEL_READY
// 5. On failure: transition to LABEL_FAILED
//
// The carrier API call uses withRetry() for transient failures.
// After BullMQ exhausts all retries, the shipment stays in LABEL_FAILED
// and the merchant can retry via the UI.

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

/**
 * Stub carrier API client.
 * In production, this would be a DHL/FedEx/UPS SDK wrapper.
 */
async function generateLabelViaCarrier(
  _shipmentData: Record<string, unknown>
): Promise<{
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  labelFormat: string;
}> {
  // STUB: Simulate carrier API latency
  // Replace with actual carrier SDK integration (e.g., @dhl-express/sdk)
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

      // Transition to LABEL_GENERATING
      await shipmentService.transition(storeId, shipmentId, "LABEL_GENERATING");

      try {
        // Look up full shipment + order details for the carrier API
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

        // Call carrier API with retry
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

        // Transition to LABEL_READY with tracking info
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
        // Transition to LABEL_FAILED
        try {
          await shipmentService.transition(storeId, shipmentId, "LABEL_FAILED");
        } catch {
          // If transition fails, log but still throw the original error
          job.log(`Failed to transition shipment ${shipmentId} to LABEL_FAILED`);
        }
        throw error; // re-throw for BullMQ retry
      }
    },
    {
      connection: redis,
      concurrency: 3, // carrier APIs are slow — don't overwhelm them
      limiter: {
        max: 10, // max 10 labels per 60 seconds per carrier
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
