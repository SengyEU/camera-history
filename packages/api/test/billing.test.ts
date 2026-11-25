import { describe, expect, it } from "vitest";
import { defineFakeStripeGateway, makeApp, testConfig } from "./helpers.js";

async function registerAndLogin(app: ReturnType<typeof makeApp>["app"]) {
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "a@acme.cz", password: "Password123" },
  });
  return (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!).join("; ");
}

const ALL_PRICES = {
  solo: "price_solo",
  starter: "price_starter",
  plus: "price_plus",
  pro: "price_pro",
  network: "price_network",
};

function stripeConfig(over: Partial<typeof testConfig.stripe> = {}) {
  return { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: ALL_PRICES, ...over } };
}

async function addCamera(repos: ReturnType<typeof makeApp>["repos"], tenantId: string, name: string) {
  return repos.createCamera(tenantId, {
    name,
    feedType: "static_url",
    feedUrl: `https://example.com/${name}.jpg`,
    intervalMinutes: 15,
    activeFrom: "00:00",
    activeTo: "23:59",
    timezone: "UTC",
  });
}

describe("billing endpoints", () => {
  it("returns the package summary with stripe disabled", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/billing", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      packageCode: "starter",
      packageName: "Starter",
      cameraLimit: 3,
      cameraCount: 0,
      price: 13.99,
      monthlyTotal: 13.99,
      billingEnabled: false,
      pricesConfigured: false,
    });
    expect(body.packages).toHaveLength(5);
    expect(body).not.toHaveProperty("freeMonthAvailable");
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns the package summary for a tenant with a camera", async () => {
    const { app, repos } = makeApp({
      cfg: stripeConfig(),
      stripe: defineFakeStripeGateway(),
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await addCamera(repos, tenant.id, "Main");
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/billing", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      packageCode: "starter",
      cameraLimit: 3,
      cameraCount: 1,
      price: 13.99,
      monthlyTotal: 13.99,
      pricesConfigured: true,
    });
    expect(res.json().packages.find((p: { code: string }) => p.code === "starter")).toMatchObject({
      current: true,
      available: true,
    });
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects an invalid package on checkout", async () => {
    const { app } = makeApp({ cfg: stripeConfig(), stripe: defineFakeStripeGateway() });
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: { packageCode: "enterprise" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("invalid_package");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects checkout when stripe is off", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("billing_disabled");
    await (app as { close: () => Promise<void> }).close();
  });

  it("keeps pilot accounts free", async () => {
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: defineFakeStripeGateway() });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    tenant.isPilot = true;
    await addCamera(repos, tenant.id, "Main");

    const checkout = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: {},
    });
    expect(checkout.statusCode).toBe(409);
    expect(checkout.json().title).toBe("pilot_account");

    const select = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/package",
      headers: { cookie },
      payload: { packageCode: "plus" },
    });
    expect(select.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.packageCode).toBe("plus");
    await (app as { close: () => Promise<void> }).close();
  });

  it("creates a checkout with one package item and no trial", async () => {
    const created: Array<Record<string, unknown>> = [];
    const gateway = defineFakeStripeGateway({
      createCheckoutSession: async (input) => {
        created.push(input as unknown as Record<string, unknown>);
        return { url: "https://checkout.stripe.com/sess", customer: "cus_123", subscription: null };
      },
    });
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: gateway });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await addCamera(repos, tenant.id, "Main");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("https://checkout.stripe.com/sess");
    expect(created[0]).toMatchObject({ priceId: "price_starter", packageCode: "starter" });
    expect(created[0]).not.toHaveProperty("items");
    expect(created[0]).not.toHaveProperty("trialPeriodDays");
    expect((await repos.getTenantById(tenant.id))!.packageCode).toBe("starter");
    await (app as { close: () => Promise<void> }).close();
  });

  it("changes the package without Stripe before checkout", async () => {
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: defineFakeStripeGateway() });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/package",
      headers: { cookie },
      payload: { packageCode: "plus" },
    });
    expect(res.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.packageCode).toBe("plus");
    await (app as { close: () => Promise<void> }).close();
  });

  it("changes the package through Stripe when a subscription exists", async () => {
    const changes: Array<Record<string, unknown>> = [];
    const gateway = defineFakeStripeGateway({
      changePackage: async (input) => {
        changes.push(input as unknown as Record<string, unknown>);
      },
    });
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: gateway });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, {
      stripeSubscriptionId: "sub_1",
      billingStatus: "active",
      packageCode: "starter",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/package",
      headers: { cookie },
      payload: { packageCode: "pro" },
    });
    expect(res.statusCode).toBe(200);
    expect(changes[0]).toEqual({
      subscriptionId: "sub_1",
      priceId: "price_pro",
      packageCode: "pro",
    });
    expect((await repos.getTenantById(tenant.id))!.packageCode).toBe("pro");
    await (app as { close: () => Promise<void> }).close();
  });

  it("blocks a downgrade while the account has too many cameras", async () => {
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: defineFakeStripeGateway() });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await addCamera(repos, tenant.id, "One");
    await addCamera(repos, tenant.id, "Two");
    await addCamera(repos, tenant.id, "Three");
    await addCamera(repos, tenant.id, "Four");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/package",
      headers: { cookie },
      payload: { packageCode: "solo" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("camera_limit_exceeded");
    expect((await repos.getTenantById(tenant.id))!.packageCode).toBe("starter");
    await (app as { close: () => Promise<void> }).close();
  });

  it("enforces the camera limit including disabled cameras", async () => {
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: defineFakeStripeGateway() });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const first = await addCamera(repos, tenant.id, "One");
    await addCamera(repos, tenant.id, "Two");
    await addCamera(repos, tenant.id, "Three");
    await repos.updateCamera(first.id, { enabled: false });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Four",
        feedType: "static_url",
        feedUrl: "https://example.com/four.jpg",
        intervalMinutes: 15,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("camera_limit_reached");
    await (app as { close: () => Promise<void> }).close();
  });

  it("opens the portal session", async () => {
    const { app, repos } = makeApp({ cfg: stripeConfig(), stripe: defineFakeStripeGateway() });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeCustomerId: "cus_123" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/portal",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("https://billing.stripe.com/test");
    await (app as { close: () => Promise<void> }).close();
  });
});

describe("billing webhook", () => {
  const sig = "t=1812,v1=whatever";

  it("returns 401 on invalid signature", async () => {
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => {
        throw new Error("bad signature");
      },
    });
    const { app } = makeApp({
      cfg: stripeConfig({ webhookSecret: "whsec_test" }),
      stripe: gateway,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(401);
    await (app as { close: () => Promise<void> }).close();
  });

  it("sets the package from checkout.session.completed", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: stripeConfig({ webhookSecret: "whsec_test" }),
      stripe: gateway,
    });
    await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    gateway.verifyWebhook = async () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { tenantId: tenant.id, packageCode: "pro" },
          customer: "cus_new",
          subscription: "sub_new",
        },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect(await repos.getTenantById(tenant.id)).toMatchObject({
      packageCode: "pro",
      stripeCustomerId: "cus_new",
      stripeSubscriptionId: "sub_new",
      billingStatus: "active",
    });
    await (app as { close: () => Promise<void> }).close();
  });

  it("keeps the grace period and package on past_due", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: stripeConfig({ webhookSecret: "whsec_test" }),
      stripe: gateway,
    });
    await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_1", billingStatus: "active" });
    gateway.verifyWebhook = async () => ({
      type: "customer.subscription.updated",
      data: {
        object: {
          metadata: { tenantId: tenant.id, packageCode: "plus" },
          status: "past_due",
        },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    const after = (await repos.getTenantById(tenant.id))!;
    expect(after.billingStatus).toBe("past_due");
    expect(after.packageCode).toBe("plus");
    expect(after.billingGraceUntil?.getTime()).toBeGreaterThan(Date.now());
    await (app as { close: () => Promise<void> }).close();
  });

  it("reads the package from a subscription price", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: stripeConfig({ webhookSecret: "whsec_test" }),
      stripe: gateway,
    });
    await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_1", billingStatus: "active" });
    gateway.verifyWebhook = async () => ({
      type: "customer.subscription.updated",
      data: {
        object: {
          metadata: { tenantId: tenant.id },
          status: "active",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.packageCode).toBe("pro");
    await (app as { close: () => Promise<void> }).close();
  });

  it("clears the subscription when it is deleted", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: stripeConfig({ webhookSecret: "whsec_test" }),
      stripe: gateway,
    });
    await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_1", billingStatus: "active" });
    gateway.verifyWebhook = async () => ({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { tenantId: tenant.id }, status: "canceled" } },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect(await repos.getTenantById(tenant.id)).toMatchObject({
      billingStatus: "canceled",
      stripeSubscriptionId: null,
    });
    await (app as { close: () => Promise<void> }).close();
  });
});
