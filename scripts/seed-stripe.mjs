#!/usr/bin/env node
// Idempotentní seed produktu, tax-inclusive cen a Billing Portal konfigurace do Stripe.
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

let product =
  (await findProduct()) ??
  (await api(
    "/products",
    {
      name: "Camera History",
      tax_code: "txcd_10103001",
      "metadata[camera_history]": "1",
    },
    "POST",
  ));

const TAX_CODE = "txcd_10103001";
if (product.tax_code !== TAX_CODE) {
  product = await api(`/products/${product.id}`, { tax_code: TAX_CODE }, "POST");
}

console.log(`product: ${product.id} (${product.name}), tax_code ${product.tax_code}`);

const priceIds = {};
for (const tier of TIERS) {
  const lookupKey = `ch_incl_${String(tier.months).replace(".", "_")}m`;
  let price = await findPrice(lookupKey);
  if (!price) {
    price = await api(
      "/prices",
      {
        product: product.id,
        currency: "eur",
        unit_amount: String(tier.eur * 100),
        billing_scheme: "per_unit",
        tax_behavior: "inclusive",
        lookup_key: lookupKey,
        "metadata[camera_history]": "1",
        "recurring[interval]": "month",
        "recurring[usage_type]": "licensed",
      },
      "POST",
    );
  }
  const envKey = `STRIPE_PRICE_${String(tier.months).replace(".", "_")}`;
  priceIds[envKey] = price.id;
  console.log(`price ${lookupKey}: ${price.id}`);
}

const portalParams = {
  "business_profile[headline]": "Správa předplatného Camera History",
  "features[subscription_cancel][enabled]": "true",
  "features[subscription_cancel][mode]": "at_period_end",
  "features[payment_method_update][enabled]": "true",
  "features[invoice_history][enabled]": "true",
  "features[subscription_update][enabled]": "false",
  "features[subscription_pause][enabled]": "false",
  "features[customer_update][enabled]": "true",
  "features[customer_update][allowed_updates][0]": "address",
  "features[customer_update][allowed_updates][1]": "name",
  "features[customer_update][allowed_updates][2]": "email",
  "metadata[camera_history]": "1",
};
const existingPortal = await findPortalConfig();
const portal = existingPortal
  ? await api(`/billing_portal/configurations/${existingPortal.id}`, portalParams, "POST")
  : await api("/billing_portal/configurations", portalParams, "POST");

console.log(`portal configuration: ${portal.id}`);

console.log("\nNastav do .env:");
for (const [k, v] of Object.entries(priceIds)) console.log(`${k}=${v}`);
console.log(`STRIPE_PORTAL_CONFIG_ID=${portal.id}`);
console.log(`STRIPE_WEBHOOK_SECRET=whsec_... (z dashboardu, endpoint /api/v1/billing/webhook)`);
console.log(
  "Stripe dashboard → Developers → Webhooks → add endpoint → events: checkout.session.completed, checkout.session.expired, customer.subscription.updated, customer.subscription.deleted",
);