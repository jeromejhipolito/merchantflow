// =============================================================================
// MerchantFlow — Database Seed
// =============================================================================
// Creates realistic demo data for development and testing.
//
// Run:  pnpm db:seed  (or:  npx tsx prisma/seed.ts)
//
// Data:
//   2 stores (Tropical Threads PH, Manila Craft Co.)
//   25 orders across both stores with line items
//   8 shipments in various statuses
//   Webhook endpoints per store
//   Outbox events in various states
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomId(): string {
  return crypto.randomUUID();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600_000);
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomDecimal(min: number, max: number): string {
  return (Math.random() * (max - min) + min).toFixed(2);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding MerchantFlow database...\n");

  // -------------------------------------------------------------------------
  // 1. Stores
  // -------------------------------------------------------------------------
  const store1Id = randomId();
  const store2Id = randomId();

  const store1 = await prisma.store.create({
    data: {
      id: store1Id,
      shopifyDomain: "tropical-threads-ph.myshopify.com",
      shopifyAccessToken: "encrypted:mock-token-store-1",
      shopifyScopes: "read_products,read_orders,write_fulfillments",
      shopifyWebhookSecret: "whsec_tropicalthreads_mock_secret",
      name: "Tropical Threads PH",
      email: "hello@tropicalthreadsph.com",
      currency: "PHP",
      timezone: "Asia/Manila",
      status: "ACTIVE",
    },
  });

  const store2 = await prisma.store.create({
    data: {
      id: store2Id,
      shopifyDomain: "manila-craft-co.myshopify.com",
      shopifyAccessToken: "encrypted:mock-token-store-2",
      shopifyScopes: "read_products,read_orders,write_fulfillments",
      shopifyWebhookSecret: "whsec_manilacraftco_mock_secret",
      name: "Manila Craft Co.",
      email: "support@manilacraftco.com",
      currency: "USD",
      timezone: "Asia/Manila",
      status: "ACTIVE",
    },
  });

  console.log(`  Created store: ${store1.name} (${store1.id})`);
  console.log(`  Created store: ${store2.name} (${store2.id})`);

  // -------------------------------------------------------------------------
  // 2. Products
  // -------------------------------------------------------------------------
  const products1 = await Promise.all([
    prisma.product.create({
      data: {
        storeId: store1Id,
        shopifyProductId: "7001000001",
        title: "Barong Tagalog - Slim Fit",
        description:
          "Hand-embroidered pinya-silk barong with classic Filipino design",
        vendor: "Tropical Threads PH",
        productType: "Formal Wear",
        status: "ACTIVE",
        sku: "BT-SLIM-001",
        barcode: "8901234567890",
        inventoryQuantity: 45,
        weight: "0.35",
        weightUnit: "kg",
        price: "4500.00",
        compareAtPrice: "5200.00",
        currencyCode: "PHP",
        hsCode: "6205.20",
        countryOfOrigin: "PH",
      },
    }),
    prisma.product.create({
      data: {
        storeId: store1Id,
        shopifyProductId: "7001000002",
        title: "Filipiniana Dress - Maria Clara",
        description: "Elegant Maria Clara inspired butterfly sleeve dress",
        vendor: "Tropical Threads PH",
        productType: "Formal Wear",
        status: "ACTIVE",
        sku: "FD-MC-001",
        inventoryQuantity: 28,
        weight: "0.50",
        weightUnit: "kg",
        price: "6800.00",
        currencyCode: "PHP",
        hsCode: "6204.49",
        countryOfOrigin: "PH",
      },
    }),
    prisma.product.create({
      data: {
        storeId: store1Id,
        shopifyProductId: "7001000003",
        title: "Terno Blouse - Contemporary",
        description: "Modern take on the traditional terno with puff sleeves",
        vendor: "Tropical Threads PH",
        productType: "Casual Wear",
        status: "ACTIVE",
        sku: "TB-CON-001",
        inventoryQuantity: 60,
        weight: "0.25",
        weightUnit: "kg",
        price: "2200.00",
        currencyCode: "PHP",
        hsCode: "6206.30",
        countryOfOrigin: "PH",
      },
    }),
    prisma.product.create({
      data: {
        storeId: store1Id,
        shopifyProductId: "7001000004",
        title: "Abaca Woven Clutch",
        description: "Handwoven abaca fiber clutch bag with brass clasp",
        vendor: "Tropical Threads PH",
        productType: "Accessories",
        status: "ACTIVE",
        sku: "AW-CLT-001",
        inventoryQuantity: 100,
        weight: "0.15",
        weightUnit: "kg",
        price: "1800.00",
        currencyCode: "PHP",
        hsCode: "4602.19",
        countryOfOrigin: "PH",
      },
    }),
  ]);

  const products2 = await Promise.all([
    prisma.product.create({
      data: {
        storeId: store2Id,
        shopifyProductId: "8001000001",
        title: "Capiz Shell Chandelier - 3 Tier",
        description:
          "Hand-assembled Capiz shell chandelier, three-tier design, brass hardware",
        vendor: "Manila Craft Co.",
        productType: "Home Decor",
        status: "ACTIVE",
        sku: "CSC-3T-001",
        inventoryQuantity: 12,
        weight: "3.50",
        weightUnit: "kg",
        price: "189.99",
        compareAtPrice: "249.99",
        currencyCode: "USD",
        hsCode: "9405.10",
        countryOfOrigin: "PH",
      },
    }),
    prisma.product.create({
      data: {
        storeId: store2Id,
        shopifyProductId: "8001000002",
        title: "Rattan Basket - Large",
        description: "Hand-woven rattan storage basket with leather handles",
        vendor: "Manila Craft Co.",
        productType: "Home Storage",
        status: "ACTIVE",
        sku: "RB-LG-001",
        inventoryQuantity: 35,
        weight: "1.20",
        weightUnit: "kg",
        price: "64.99",
        currencyCode: "USD",
        hsCode: "4602.12",
        countryOfOrigin: "PH",
      },
    }),
    prisma.product.create({
      data: {
        storeId: store2Id,
        shopifyProductId: "8001000003",
        title: "Coconut Shell Bowl Set (4pc)",
        description:
          "Polished coconut shell serving bowls with lacquer finish",
        vendor: "Manila Craft Co.",
        productType: "Kitchenware",
        status: "ACTIVE",
        sku: "CSB-4P-001",
        inventoryQuantity: 50,
        weight: "0.80",
        weightUnit: "kg",
        price: "39.99",
        currencyCode: "USD",
        hsCode: "4419.12",
        countryOfOrigin: "PH",
      },
    }),
  ]);

  console.log(
    `  Created ${products1.length + products2.length} products across both stores`
  );

  // -------------------------------------------------------------------------
  // 3. Orders (25 total across both stores)
  // -------------------------------------------------------------------------

  const firstNames = [
    "Maria", "Juan", "Ana", "Carlos", "Rosa", "Miguel", "Sofia", "Jose",
    "Luz", "Pedro", "Elena", "Ramon", "Isabella", "David", "Carmen",
    "Sarah", "James", "Emily", "Michael", "Olivia", "Daniel", "Laura",
    "Mark", "Grace", "Kevin",
  ];
  const lastNames = [
    "Santos", "Reyes", "Cruz", "Garcia", "Torres", "Ramos", "Dela Cruz",
    "Villanueva", "Aquino", "Bautista", "Gonzales", "Rivera", "Martinez",
    "Lopez", "Smith", "Johnson", "Williams", "Brown", "Jones", "Davis",
    "Wilson", "Anderson", "Taylor", "Thomas", "Moore",
  ];
  const cities = [
    "Makati City", "Cebu City", "Quezon City", "Davao City", "Pasig City",
    "San Francisco", "New York", "Los Angeles", "Chicago", "Seattle",
    "London", "Singapore", "Tokyo", "Sydney", "Toronto",
  ];
  const countryCodes = [
    "PH", "PH", "PH", "PH", "PH",
    "US", "US", "US", "US", "US",
    "GB", "SG", "JP", "AU", "CA",
  ];
  const financialStatuses = [
    "PAID", "PAID", "PAID", "PAID", "PAID", "PAID", "PAID", "PAID",
    "AUTHORIZED", "PENDING", "PARTIALLY_REFUNDED",
  ] as const;
  const fulfillmentStatuses = [
    "UNFULFILLED", "UNFULFILLED", "UNFULFILLED", "UNFULFILLED",
    "PARTIALLY_FULFILLED", "PARTIALLY_FULFILLED",
    "FULFILLED", "FULFILLED",
  ] as const;

  const orderIds: string[] = [];
  const ordersForStore1: string[] = [];
  const ordersForStore2: string[] = [];

  for (let i = 0; i < 25; i++) {
    const isStore1 = i < 15; // 15 orders for store1, 10 for store2
    const storeId = isStore1 ? store1Id : store2Id;
    const storeProducts = isStore1 ? products1 : products2;
    const orderId = randomId();
    orderIds.push(orderId);
    if (isStore1) ordersForStore1.push(orderId);
    else ordersForStore2.push(orderId);

    const firstName = firstNames[i]!;
    const lastName = lastNames[i]!;
    const cityIdx = i % cities.length;
    const city = cities[cityIdx]!;
    const countryCode = countryCodes[cityIdx]!;
    const financialStatus = randomElement([...financialStatuses]);
    const fulfillmentStatus = randomElement([...fulfillmentStatuses]);

    // Generate 1-3 line items per order
    const numLineItems = (i % 3) + 1;
    const lineItemsData: Array<{
      shopifyLineItemId: string;
      productId: string;
      title: string;
      sku: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      hsCode: string | null;
      countryOfOrigin: string | null;
      weight: string | null;
    }> = [];

    let subtotal = 0;
    for (let j = 0; j < numLineItems; j++) {
      const product = storeProducts[j % storeProducts.length]!;
      const qty = (j % 3) + 1;
      const price = parseFloat(product.price.toString());
      const total = price * qty;
      subtotal += total;

      lineItemsData.push({
        shopifyLineItemId: `li_${1000 + i * 10 + j}`,
        productId: product.id,
        title: product.title,
        sku: product.sku ?? `SKU-${j}`,
        quantity: qty,
        unitPrice: price.toFixed(2),
        totalPrice: total.toFixed(2),
        hsCode: product.hsCode,
        countryOfOrigin: product.countryOfOrigin,
        weight: product.weight?.toString() ?? null,
      });
    }

    const tax = subtotal * 0.12;
    const shipping = isStore1 ? 250 : 15.99;
    const discount = i % 5 === 0 ? subtotal * 0.1 : 0;
    const totalPrice = subtotal + tax + shipping - discount;

    await prisma.order.create({
      data: {
        id: orderId,
        storeId,
        shopifyOrderId: `${5000000 + i}`,
        orderNumber: `#${1001 + i}`,
        subtotalPrice: subtotal.toFixed(2),
        totalTax: tax.toFixed(2),
        totalShipping: shipping.toFixed(2),
        totalDiscount: discount.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        currencyCode: isStore1 ? "PHP" : "USD",
        financialStatus,
        fulfillmentStatus,
        customerEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(" ", "")}@email.com`,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerPhone: `+63${900 + i}0001234`,
        shippingAddressLine1: `${100 + i} Main Street`,
        shippingAddressLine2: i % 3 === 0 ? `Unit ${i + 1}` : null,
        shippingCity: city,
        shippingProvince: countryCode === "PH" ? "Metro Manila" : city,
        shippingPostalCode: `${1000 + (i * 11) % 9000}`,
        shippingCountryCode: countryCode,
        shippingPhone: `+63${900 + i}0001234`,
        shopifyCreatedAt: daysAgo(25 - i),
        shopifySyncedAt: daysAgo(25 - i),
        lineItems: {
          create: lineItemsData.map((li) => ({
            shopifyLineItemId: li.shopifyLineItemId,
            productId: li.productId,
            title: li.title,
            sku: li.sku,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            totalPrice: li.totalPrice,
            hsCode: li.hsCode,
            countryOfOrigin: li.countryOfOrigin,
            weight: li.weight,
          })),
        },
      },
    });
  }

  console.log(
    `  Created 25 orders (15 for ${store1.name}, 10 for ${store2.name})`
  );

  // -------------------------------------------------------------------------
  // 4. Shipments (8 total in various statuses)
  // -------------------------------------------------------------------------
  const carriers = ["DHL Express", "FedEx", "PhilPost", "LBC Express"];
  const services = ["Express", "Economy", "Standard", "Priority"];

  const shipmentConfigs = [
    { storeId: store1Id, orderId: ordersForStore1[0]!, status: "DELIVERED" as const, carrier: "DHL Express", service: "Express" },
    { storeId: store1Id, orderId: ordersForStore1[1]!, status: "SHIPPED" as const, carrier: "FedEx", service: "Priority" },
    { storeId: store1Id, orderId: ordersForStore1[2]!, status: "LABEL_READY" as const, carrier: "PhilPost", service: "Standard" },
    { storeId: store1Id, orderId: ordersForStore1[3]!, status: "LABEL_GENERATING" as const, carrier: "LBC Express", service: "Economy" },
    { storeId: store1Id, orderId: ordersForStore1[4]!, status: "PENDING" as const, carrier: "DHL Express", service: "Express" },
    { storeId: store2Id, orderId: ordersForStore2[0]!, status: "IN_TRANSIT" as const, carrier: "FedEx", service: "Express" },
    { storeId: store2Id, orderId: ordersForStore2[1]!, status: "LABEL_READY" as const, carrier: "DHL Express", service: "Priority" },
    { storeId: store2Id, orderId: ordersForStore2[2]!, status: "LABEL_FAILED" as const, carrier: "PhilPost", service: "Economy" },
  ];

  for (let i = 0; i < shipmentConfigs.length; i++) {
    const cfg = shipmentConfigs[i]!;
    const hasTracking = ["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(cfg.status);
    const hasLabel = ["LABEL_READY", "SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(cfg.status);

    await prisma.shipment.create({
      data: {
        storeId: cfg.storeId,
        orderId: cfg.orderId,
        carrier: cfg.carrier,
        service: cfg.service,
        status: cfg.status,
        trackingNumber: hasTracking ? `MF${1000000 + i}` : null,
        trackingUrl: hasTracking
          ? `https://track.example.com/MF${1000000 + i}`
          : null,
        labelUrl: hasLabel
          ? `https://labels.example.com/${randomId()}.pdf`
          : null,
        labelFormat: hasLabel ? "PDF" : null,
        labelGeneratedAt: hasLabel ? hoursAgo(48 - i * 6) : null,
        weightGrams: 350 + i * 100,
        lengthCm: "25.00",
        widthCm: "18.00",
        heightCm: "8.00",
        customsDeclarationValue: cfg.storeId === store2Id ? randomDecimal(50, 300) : randomDecimal(2000, 10000),
        customsCurrency: cfg.storeId === store2Id ? "USD" : "PHP",
        shippedAt: ["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(cfg.status)
          ? hoursAgo(36 - i * 4)
          : null,
        deliveredAt: cfg.status === "DELIVERED" ? hoursAgo(6) : null,
        externalShipmentId: hasTracking ? `carrier-ref-${randomId().slice(0, 8)}` : null,
      },
    });
  }

  console.log(`  Created 8 shipments in various statuses`);

  // -------------------------------------------------------------------------
  // 5. Webhook Endpoints
  // -------------------------------------------------------------------------
  const endpoint1 = await prisma.webhookEndpoint.create({
    data: {
      storeId: store1Id,
      url: "https://hooks.tropicalthreadsph.com/merchantflow",
      secret: "whsec_" + crypto.randomUUID().replace(/-/g, ""),
      events: [
        "order.synced",
        "shipment.created",
        "shipment.shipped",
        "shipment.delivered",
      ],
      isActive: true,
      failureCount: 0,
      lastSucceededAt: hoursAgo(2),
    },
  });

  const endpoint2 = await prisma.webhookEndpoint.create({
    data: {
      storeId: store1Id,
      url: "https://erp.tropicalthreadsph.com/api/webhooks",
      secret: "whsec_" + crypto.randomUUID().replace(/-/g, ""),
      events: ["order.synced", "shipment.delivered"],
      isActive: true,
      failureCount: 2,
      lastFailedAt: hoursAgo(1),
      lastSucceededAt: hoursAgo(5),
    },
  });

  const endpoint3 = await prisma.webhookEndpoint.create({
    data: {
      storeId: store2Id,
      url: "https://api.manilacraftco.com/webhooks/merchantflow",
      secret: "whsec_" + crypto.randomUUID().replace(/-/g, ""),
      events: [
        "order.synced",
        "shipment.created",
        "shipment.label_ready",
        "shipment.shipped",
        "shipment.in_transit",
        "shipment.delivered",
        "shipment.failed",
      ],
      isActive: true,
      failureCount: 0,
      lastSucceededAt: hoursAgo(1),
    },
  });

  // Disabled endpoint (too many failures)
  await prisma.webhookEndpoint.create({
    data: {
      storeId: store2Id,
      url: "https://old-system.manilacraftco.com/hooks",
      secret: "whsec_" + crypto.randomUUID().replace(/-/g, ""),
      events: ["order.synced"],
      isActive: false,
      failureCount: 10,
      lastFailedAt: daysAgo(3),
      disabledAt: daysAgo(3),
      disabledReason:
        "Auto-disabled after 10 consecutive failures.",
    },
  });

  console.log(`  Created 4 webhook endpoints`);

  // -------------------------------------------------------------------------
  // 6. Webhook Deliveries (a few sample deliveries)
  // -------------------------------------------------------------------------
  await prisma.webhookDelivery.createMany({
    data: [
      {
        endpointId: endpoint1.id,
        eventType: "order.synced",
        payload: { orderId: ordersForStore1[0], event: "order.synced" },
        status: "SUCCEEDED",
        httpStatus: 200,
        attemptCount: 1,
        lastAttemptAt: hoursAgo(3),
        completedAt: hoursAgo(3),
      },
      {
        endpointId: endpoint1.id,
        eventType: "shipment.shipped",
        payload: { shipmentId: "mock-shipment-1", event: "shipment.shipped" },
        status: "SUCCEEDED",
        httpStatus: 200,
        attemptCount: 1,
        lastAttemptAt: hoursAgo(2),
        completedAt: hoursAgo(2),
      },
      {
        endpointId: endpoint2.id,
        eventType: "order.synced",
        payload: { orderId: ordersForStore1[1], event: "order.synced" },
        status: "FAILED",
        httpStatus: 503,
        attemptCount: 3,
        lastAttemptAt: hoursAgo(1),
        errorMessage: "Service temporarily unavailable",
      },
      {
        endpointId: endpoint3.id,
        eventType: "shipment.created",
        payload: { shipmentId: "mock-shipment-6", event: "shipment.created" },
        status: "SUCCEEDED",
        httpStatus: 200,
        attemptCount: 1,
        lastAttemptAt: hoursAgo(4),
        completedAt: hoursAgo(4),
      },
    ],
  });

  console.log(`  Created 4 webhook deliveries`);

  // -------------------------------------------------------------------------
  // 7. Shopify Webhook Logs (inbound deduplication records)
  // -------------------------------------------------------------------------
  await prisma.shopifyWebhookLog.createMany({
    data: [
      {
        shopifyWebhookId: `wh_${randomId()}`,
        topic: "orders/create",
        shopifyDomain: "tropical-threads-ph.myshopify.com",
        status: "PROCESSED",
        processedAt: hoursAgo(12),
      },
      {
        shopifyWebhookId: `wh_${randomId()}`,
        topic: "orders/updated",
        shopifyDomain: "tropical-threads-ph.myshopify.com",
        status: "PROCESSED",
        processedAt: hoursAgo(6),
      },
      {
        shopifyWebhookId: `wh_${randomId()}`,
        topic: "orders/create",
        shopifyDomain: "manila-craft-co.myshopify.com",
        status: "PROCESSED",
        processedAt: hoursAgo(3),
      },
      {
        shopifyWebhookId: `wh_${randomId()}`,
        topic: "products/update",
        shopifyDomain: "tropical-threads-ph.myshopify.com",
        status: "FAILED",
        errorMessage: "Product not found in local catalog",
      },
    ],
  });

  console.log(`  Created 4 Shopify webhook log entries`);

  // -------------------------------------------------------------------------
  // 8. Outbox Events
  // -------------------------------------------------------------------------
  await prisma.outboxEvent.createMany({
    data: [
      // Published events (already dispatched)
      {
        storeId: store1Id,
        aggregateType: "Order",
        aggregateId: ordersForStore1[0]!,
        eventType: "order.synced",
        payload: {
          orderId: ordersForStore1[0],
          shopifyOrderId: "5000000",
          orderNumber: "#1001",
        },
        status: "PUBLISHED",
        publishedAt: hoursAgo(12),
        attempts: 1,
      },
      {
        storeId: store1Id,
        aggregateType: "Shipment",
        aggregateId: randomId(),
        eventType: "shipment.created",
        payload: {
          shipmentId: "mock",
          orderId: ordersForStore1[0],
          carrier: "DHL Express",
        },
        status: "PUBLISHED",
        publishedAt: hoursAgo(10),
        attempts: 1,
      },
      {
        storeId: store1Id,
        aggregateType: "Shipment",
        aggregateId: randomId(),
        eventType: "shipment.shipped",
        payload: {
          shipmentId: "mock",
          orderId: ordersForStore1[1],
          status: "SHIPPED",
          trackingNumber: "MF1000001",
        },
        status: "PUBLISHED",
        publishedAt: hoursAgo(6),
        attempts: 1,
      },

      // Pending events (waiting to be polled)
      {
        storeId: store2Id,
        aggregateType: "Order",
        aggregateId: ordersForStore2[3]!,
        eventType: "order.synced",
        payload: {
          orderId: ordersForStore2[3],
          shopifyOrderId: "5000018",
          orderNumber: "#1019",
        },
        status: "PENDING",
        attempts: 0,
      },
      {
        storeId: store2Id,
        aggregateType: "Order",
        aggregateId: ordersForStore2[4]!,
        eventType: "order.synced",
        payload: {
          orderId: ordersForStore2[4],
          shopifyOrderId: "5000019",
          orderNumber: "#1020",
        },
        status: "PENDING",
        attempts: 0,
      },

      // Failed event (exhausted retries)
      {
        storeId: store1Id,
        aggregateType: "Shipment",
        aggregateId: randomId(),
        eventType: "shipment.label_failed",
        payload: {
          shipmentId: "mock-failed",
          orderId: ordersForStore1[5]!,
          status: "LABEL_FAILED",
        },
        status: "FAILED",
        attempts: 5,
        lastError: "Queue unavailable after 5 attempts",
      },

      // Pending with retry scheduled
      {
        storeId: store1Id,
        aggregateType: "Order",
        aggregateId: ordersForStore1[10]!,
        eventType: "order.synced",
        payload: {
          orderId: ordersForStore1[10],
          shopifyOrderId: "5000010",
          orderNumber: "#1011",
        },
        status: "PENDING",
        attempts: 2,
        lastError: "Temporary Redis connection error",
        nextRetryAt: hoursAgo(-1), // 1 hour in the future
      },
    ],
  });

  console.log(`  Created 7 outbox events (3 published, 3 pending, 1 failed)`);

  // -------------------------------------------------------------------------
  // 9. Idempotency Keys (a couple of examples)
  // -------------------------------------------------------------------------
  await prisma.idempotencyKey.createMany({
    data: [
      {
        storeId: store1Id,
        key: crypto.randomUUID(),
        httpMethod: "POST",
        httpPath: "/api/v1/orders/mock/shipments",
        requestHash:
          "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        responseStatus: 202,
        responseBody: { data: { id: "mock-shipment", status: "PENDING" } },
        completedAt: hoursAgo(6),
        expiresAt: hoursAgo(-18), // 18 hours from now
      },
      {
        storeId: store2Id,
        key: crypto.randomUUID(),
        httpMethod: "POST",
        httpPath: "/api/v1/webhooks",
        requestHash:
          "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
        responseStatus: 201,
        responseBody: { data: { id: "mock-endpoint" } },
        completedAt: hoursAgo(2),
        expiresAt: hoursAgo(-22), // 22 hours from now
      },
    ],
  });

  console.log(`  Created 2 idempotency key records`);

  // -------------------------------------------------------------------------
  // Done!
  // -------------------------------------------------------------------------
  console.log(
    "\nSeed complete. Database populated with realistic demo data."
  );
  console.log(`\n  Store 1 API Key (use as Bearer token): ${store1Id}`);
  console.log(`  Store 2 API Key (use as Bearer token): ${store2Id}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
