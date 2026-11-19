#!/usr/bin/env node
// Idempotentní seed produktu, tax-inclusive cen balíčků a Billing Portal konfigurace do Stripe.
// Bez deps: volá Stripe REST API přes global fetch (Node >= 20).
// Použití: node --env-file=.env scripts/seed-stripe.mjs

const PACKAGES = [
  { code: "solo", name: "Solo", eur: 7.99 },
  { code: "starter", name: "Starter", eur: 13.99 },
  { code: "plus", name: "Plus", eur: 19.99 },
  { code: "pro", name: "Pro", eur: 29.99 },
  { code: "network", name: "Network", eur: 49.99 },
];

const OLD_LOOKUP_KEYS = [
  "ch_incl_0_5m",
  "ch_incl_1m",
  "ch_incl_3m",
  "ch_incl_6m",
  "ch_incl_12m",
  "ch_incl_24m",
  "ch_incl_36m",
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

async function archiveOldPrices() {
  for (const lookupKey of OLD_LOOKUP_KEYS) {
    const { data } = await api("/prices", { "lookup_keys[]": lookupKey, active: "true", limit: "10" });
    for (const price of data) {
      await api(`/prices/${price.id}`, { active: "false" }, "POST");
      console.log(`archived ${lookupKey}: ${price.id}`);
    }
  }
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

await archiveOldPrices();

const priceIds = {};
for (const pkg of PACKAGES) {
  const cents = Math.round(pkg.eur * 100);
  const lookupKey = `ch_${pkg.code}_${cents}`;
  let price = await findPrice(lookupKey);
  if (!price) {
    price = await api(
      "/prices",
      {
        product: product.id,
        currency: "eur",
        unit_amount: String(cents),
        billing_scheme: "per_unit",
        tax_behavior: "inclusive",
        lookup_key: lookupKey,
        nickname: pkg.name,
        "metadata[camera_history]": "1",
        "metadata[package_code]": pkg.code,
        "recurring[interval]": "month",
        "recurring[usage_type]": "licensed",
      },
      "POST",
    );
    console.log(`price ${lookupKey}: ${price.id}`);
  } else {
    console.log(`price ${lookupKey}: ${price.id} (existing)`);
  }
  priceIds[`STRIPE_PRICE_${pkg.code.toUpperCase()}`] = price.id;
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
for (const [key, value] of Object.entries(priceIds)) console.log(`${key}=${value}`);
console.log(`STRIPE_PORTAL_CONFIG_ID=${portal.id}`);
console.log(`STRIPE_WEBHOOK_SECRET=whsec_... (z dashboardu, endpoint /api/v1/billing/webhook)`);
console.log(
  "Stripe dashboard → Developers → Webhooks → add endpoint → events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted",
);
