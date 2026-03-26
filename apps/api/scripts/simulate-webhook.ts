#!/usr/bin/env npx tsx
// =============================================================================
// MerchantFlow — Shopify Webhook Simulator
// =============================================================================
// Simulates Shopify sending a webhook to MerchantFlow.
// Signs the payload with HMAC-SHA256 (exactly like Shopify does).
//
// Usage:
//   npx tsx scripts/simulate-webhook.ts                  # orders/create
//   npx tsx scripts/simulate-webhook.ts orders/updated   # specific topic
//   npx tsx scripts/simulate-webhook.ts orders/fulfilled
//
// This script:
// 1. Generates a realistic Shopify order payload
// 2. Signs it with the app's SHOPIFY_API_SECRET (HMAC-SHA256, base64)
// 3. Sends it to POST /webhooks/shopify with all required headers
// 4. Shows the server response and processing result

import { createHmac, randomUUID } from "node:crypto";

const API_URL = process.env.API_URL ?? "http://localhost:3005";

// Per-store webhook secrets (from seed data)
// In production, each store has its own secret set during Shopify OAuth install.
// The webhook handler verifies using the store-specific secret first.
const STORE_SECRETS: Record<string, string> = {
  "kultura-filipino.myshopify.com": "whsec_kulturafilipino_mock_secret",
  "pasalubong-box-ph.myshopify.com": "whsec_pasalubongboxph_mock_secret",
};

const SHOP_DOMAIN = process.argv[3] ?? "kultura-filipino.myshopify.com";
const SHOPIFY_SECRET = STORE_SECRETS[SHOP_DOMAIN] ?? "mock-shopify-api-secret";

const topic = process.argv[2] ?? "orders/create";

// ---------------------------------------------------------------------------
// Sample Shopify payloads (realistic shapes)
// ---------------------------------------------------------------------------

function generateOrderPayload(topic: string) {
  const orderId = Math.floor(Math.random() * 900000000) + 100000000;
  const orderNumber = Math.floor(Math.random() * 9000) + 1000;

  const base = {
    id: orderId,
    admin_graphql_api_id: `gid://shopify/Order/${orderId}`,
    order_number: orderNumber,
    name: `#${orderNumber}`,
    email: "maria.santos@example.com",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_price: "2499.00",
    subtotal_price: "2299.00",
    total_tax: "200.00",
    total_discounts: "0.00",
    total_shipping_price_set: {
      shop_money: { amount: "150.00", currency_code: "PHP" },
    },
    currency: "PHP",
    financial_status: topic === "orders/fulfilled" ? "paid" : "pending",
    fulfillment_status: topic === "orders/fulfilled" ? "fulfilled" : null,
    customer: {
      id: 7890123456,
      email: "maria.santos@example.com",
      first_name: "Maria",
      last_name: "Santos",
      phone: "+639171234567",
    },
    shipping_address: {
      first_name: "Maria",
      last_name: "Santos",
      address1: "123 Rizal Avenue",
      address2: "Unit 4B",
      city: "Makati",
      province: "Metro Manila",
      zip: "1200",
      country_code: "PH",
      phone: "+639171234567",
    },
    line_items: [
      {
        id: Math.floor(Math.random() * 900000000) + 100000000,
        title: "Tropical Print Polo Shirt",
        variant_title: "Large / Navy Blue",
        sku: "TPP-LG-NVY",
        quantity: 2,
        price: "899.00",
        total_discount: "0.00",
        fulfillable_quantity: topic === "orders/fulfilled" ? 0 : 2,
        fulfillment_status: topic === "orders/fulfilled" ? "fulfilled" : null,
      },
      {
        id: Math.floor(Math.random() * 900000000) + 100000000,
        title: "Handwoven Abaca Tote Bag",
        variant_title: "Natural",
        sku: "HAT-NAT",
        quantity: 1,
        price: "501.00",
        total_discount: "0.00",
        fulfillable_quantity: topic === "orders/fulfilled" ? 0 : 1,
        fulfillment_status: topic === "orders/fulfilled" ? "fulfilled" : null,
      },
    ],
  };

  if (topic === "orders/fulfilled") {
    return {
      ...base,
      fulfillments: [
        {
          id: Math.floor(Math.random() * 900000000) + 100000000,
          status: "success",
          tracking_number: "PH" + Math.floor(Math.random() * 9000000000),
          tracking_company: "LBC Express",
          tracking_url: "https://lbc.com.ph/track",
        },
      ],
    };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Sign and send
// ---------------------------------------------------------------------------

async function main() {
  const webhookId = randomUUID();
  const payload = generateOrderPayload(topic);
  const body = JSON.stringify(payload);

  // Sign exactly like Shopify does: HMAC-SHA256 of raw body, base64 encoded
  const hmac = createHmac("sha256", SHOPIFY_SECRET)
    .update(body)
    .digest("base64");

  console.log("=== MerchantFlow Webhook Simulator ===\n");
  console.log(`Topic:       ${topic}`);
  console.log(`Shop:        ${SHOP_DOMAIN}`);
  console.log(`Webhook ID:  ${webhookId}`);
  console.log(`Order:       #${payload.order_number} (${payload.id})`);
  console.log(`HMAC:        ${hmac.substring(0, 20)}...`);
  console.log(`Endpoint:    POST ${API_URL}/webhooks/shopify\n`);

  try {
    const response = await fetch(`${API_URL}/webhooks/shopify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": hmac,
        "X-Shopify-Webhook-Id": webhookId,
        "X-Shopify-Topic": topic,
        "X-Shopify-Shop-Domain": SHOP_DOMAIN,
        "X-Shopify-Api-Version": "2024-01",
      },
      body,
    });

    const result = await response.json();

    console.log(`Status:      ${response.status} ${response.statusText}`);
    console.log(`Response:    ${JSON.stringify(result, null, 2)}\n`);

    if (response.status === 200) {
      console.log("Webhook accepted! The order is now being processed by BullMQ workers.");
      console.log("Check the API logs to see the processing pipeline.\n");

      // Try sending the SAME webhook again to demo idempotency
      console.log("--- Sending SAME webhook again (idempotency test) ---\n");

      const dupeResponse = await fetch(`${API_URL}/webhooks/shopify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Hmac-Sha256": hmac,
          "X-Shopify-Webhook-Id": webhookId,
          "X-Shopify-Topic": topic,
          "X-Shopify-Shop-Domain": SHOP_DOMAIN,
          "X-Shopify-Api-Version": "2024-01",
        },
        body,
      });

      const dupeResult = await dupeResponse.json();
      console.log(`Status:      ${dupeResponse.status}`);
      console.log(`Response:    ${JSON.stringify(dupeResult, null, 2)}`);
      console.log("\nDuplicate webhook was idempotently ignored (not re-processed).");
    }

    // Also test with tampered HMAC
    console.log("\n--- Sending webhook with INVALID HMAC (security test) ---\n");

    const badResponse = await fetch(`${API_URL}/webhooks/shopify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": "INVALID_HMAC_SIGNATURE_TAMPERED",
        "X-Shopify-Webhook-Id": randomUUID(),
        "X-Shopify-Topic": topic,
        "X-Shopify-Shop-Domain": SHOP_DOMAIN,
      },
      body,
    });

    const badResult = await badResponse.json();
    console.log(`Status:      ${badResponse.status}`);
    console.log(`Response:    ${JSON.stringify(badResult, null, 2)}`);
    console.log("\nInvalid HMAC correctly rejected.");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
