#!/usr/bin/env node
// Idempotentní seed produktu, metered cen a Billing Portal konfigurace do Stripe.
// Bez deps: volá Stripe REST API přes global fetch (Node >= 20).
// Použití: STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs

const TIERS = [
  { months: 0.5, label: "14 dní", eur: 5 },
  { months: 1, label: "1 měsíc", eur: 9 },
  { months: 3, label: "3 měsíce", eur: 15 },
  { months: 6, label: "6 měsíců", eur: 22 },
  { months: 12, label: "12 měsíců", eur: 29 },
  { months: 24, label: "24 měsíců", eur: 49 },
  { months: 36, label: "36 měsíců", eur: 69 },
];

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}

const BASE = "https://api.stripe.com/v1";

async function api(path, params = {}, method = "GET") {
  const query = method === "GET" ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${BASE}${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey}` },
    body: method === "POST" ? new URLSearchParams(params) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function findProduct() {
  const { data } = await api("/products", { active: "true", limit: "100" });
  return data.find((p) => p.metadata.camera_history === "1") ?? null;
}

async function findPrice(lookupKey) {
  const { data } = await api("/prices", { "lookup_keys[]": lookupKey, active: "true", limit: "10" });
  return data.find((p) => p.lookup_key === lookupKey) ?? null;
}

async function findPortalConfig() {
  const { data } = await api("/billing_portal/configurations", { limit: "100" });
  return data.find((c) => c.metadata.camera_history === "1") ?? null;
}

const product =
  (await findProduct()) ??
  (await api(
    "/products",
    {
      name: "Camera History",
      "metadata[camera_history]": "1",
    },
    "POST",
  ));

console.log(`product: ${product.id} (${product.name})`);

const priceIds = {};
for (const tier of TIERS) {
  const lookupKey = `ch_${String(tier.months).replace(".", "_")}m`;
  let price = await findPrice(lookupKey);
  if (!price) {
    price = await api(
      "/prices",
      {
        product: product.id,
        currency: "eur",
        unit_amount: String(tier.eur * 100),
        billing_scheme: "per_unit",
        lookup_key: lookupKey,
        "metadata[camera_history]": "1",
        "recurring[interval]": "month",
        "recurring[usage_type]": "metered",
        "recurring[aggregate_usage]": "last_value",
      },
      "POST",
    );
  }
  const envKey = `STRIPE_PRICE_${String(tier.months).replace(".", "_")}`;
  priceIds[envKey] = price.id;
  console.log(`price ${lookupKey}: ${price.id}`);
}

const portal =
  (await findPortalConfig()) ??
  (await api(
    "/billing_portal/configurations",
    {
      "business_profile[headline]": "Správa předplatného Camera History",
      "features[subscription_cancel][enabled]": "true",
      "features[subscription_cancel][mode]": "at_period_end",
      "features[payment_method_update][enabled]": "true",
      "features[invoice_history][enabled]": "true",
      "metadata[camera_history]": "1",
    },
    "POST",
  ));

console.log(`portal configuration: ${portal.id}`);

console.log("\nNastav do .env:");
for (const [k, v] of Object.entries(priceIds)) console.log(`${k}=${v}`);
console.log(`STRIPE_WEBHOOK_SECRET=whsec_... (z dashboardu, endpoint /api/v1/billing/webhook)`);
console.log(
  "Stripe dashboard → Developers → Webhooks → add endpoint → events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted",
);