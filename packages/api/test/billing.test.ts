import { describe, expect, it } from "vitest";
import { defineFakeStripeGateway, makeApp, testConfig } from "./helpers.js";

async function registerAndLogin(app: ReturnType<typeof makeApp>["app"]) {
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "a@acme.cz", password: "password123" },
  });
  return (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!).join("; ");
}

describe("billing endpoints", () => {
  it("returns billing summary with stripe disabled", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/billing", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().billingEnabled).toBe(false);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns billing summary for a tenant", async () => {
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12" } } },
      stripe: defineFakeStripeGateway(),
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const cam = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: cam.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: "k",
      sizeBytes: 120,
    });
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/billing", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.billingEnabled).toBe(true);
    expect(body.planMonths).toBe(12);
    expect(body.price).toBe(29);
    expect(body.cameraCount).toBe(1);
    expect(body.usageBytes).toBe(120);
    expect(Array.isArray(body.tiers) && body.tiers.length).toBe(7);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects invalid plan months on checkout", async () => {
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12" } } },
      stripe: defineFakeStripeGateway(),
    });
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: { planMonths: 7 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("invalid_plan_months");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects checkout when stripe is off", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: { planMonths: 12 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("billing_disabled");
    await (app as { close: () => Promise<void> }).close();
  });

  it("creates checkout session for a new subscription", async () => {
    const created: Array<Record<string, unknown>> = [];
    const gateway = defineFakeStripeGateway({
      createCheckoutSession: async (input) => {
        created.push(input as unknown as Record<string, unknown>);
        return { url: "https://checkout.stripe.com/sess", customer: "cus_123", subscription: null };
      },
    });
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "24": "price_24" } } },
      stripe: gateway,
    });
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: { planMonths: 24 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("https://checkout.stripe.com/sess");
    expect(created[0]).toMatchObject({ priceId: "price_24", planMonths: 24 });
    await (app as { close: () => Promise<void> }).close();
  });

  it("updates an existing subscription price", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const gateway = defineFakeStripeGateway({
      updateSubscription: async (input) => {
        calls.push(input as unknown as Record<string, unknown>);
      },
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12", "3": "price_3" } } },
      stripe: gateway,
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_existing", billingStatus: "active" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/billing/checkout",
      headers: { cookie },
      payload: { planMonths: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
    expect(calls[0]).toMatchObject({ subscriptionId: "sub_existing", priceId: "price_3" });
    await (app as { close: () => Promise<void> }).close();
  });

  it("opens portal session", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true } },
      stripe: gateway,
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeCustomerId: "cus_123" });
    const res = await app.inject({ method: "POST", url: "/api/v1/admin/billing/portal", headers: { cookie } });
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
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
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

  it("syncs checkout.session.completed", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    gateway.verifyWebhook = async () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { tenantId: tenant.id, planMonths: "24" },
          customer: "cus_new",
          subscription: "sub_new",
        },
      },
    });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    void token;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: JSON.stringify({ tenantId: tenant.id }),
    });
    expect(res.statusCode).toBe(200);
    const after = (await repos.getTenantById(tenant.id))!;
    expect(after).toMatchObject({
      stripeCustomerId: "cus_new",
      stripeSubscriptionId: "sub_new",
      billingStatus: "active",
      planMonths: 24,
    });
    expect(repos.db.cameras[0]!.enabled).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("sets past_due with grace then disables cameras on unpaid", async () => {
    const events: Array<{ type: string; object: Record<string, unknown> }> = [];
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => {
        const e = events.shift()!;
        return { type: e.type, data: { object: e.object } };
      },
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_1", billingStatus: "active" });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    void token;

    events.push({
      type: "customer.subscription.updated",
      object: { metadata: { tenantId: tenant.id }, status: "past_due" },
    });
    const past = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(past.statusCode).toBe(200);
    const pastDue = (await repos.getTenantById(tenant.id))!;
    expect(pastDue.billingStatus).toBe("past_due");
    expect(pastDue.billingGraceUntil && pastDue.billingGraceUntil.getTime()).toBeGreaterThan(Date.now());

    events.push({
      type: "customer.subscription.updated",
      object: { metadata: { tenantId: tenant.id }, status: "unpaid" },
    });
    const unpaid = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(unpaid.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("unpaid");
    expect(repos.db.cameras[0]!.enabled).toBe(false);
    await (app as { close: () => Promise<void> }).close();
  });

  it("reactivates cameras on active subscription", async () => {
    const events: Array<{ type: string; object: Record<string, unknown> }> = [];
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => {
        const e = events.shift()!;
        return { type: e.type, data: { object: e.object } };
      },
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_2", billingStatus: "past_due" });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.setTenantCamerasEnabled(tenant.id, false);
    void token;

    events.push({
      type: "customer.subscription.updated",
      object: {
        metadata: { tenantId: tenant.id },
        status: "active",
        items: { data: [{ price: { id: "price_12" } }] },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("active");
    expect(repos.db.cameras[0]!.enabled).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("marks tenant canceled and disables cameras on deleted", async () => {
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: defineFakeStripeGateway({
        verifyWebhook: async () => {
          const tenant = repos.db.tenants[0]!;
          return {
            type: "customer.subscription.deleted",
            data: { object: { metadata: { tenantId: tenant.id } } },
          };
        },
      }),
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_3", billingStatus: "active" });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    void token;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("canceled");
    expect(repos.db.cameras[0]!.enabled).toBe(false);
    await (app as { close: () => Promise<void> }).close();
  });
});