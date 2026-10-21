import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@ch/core";
import { createFakeRepos } from "@ch/db";
import { runBillingJobs, type MeteringGateway } from "../src/billing.js";

const cfg: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
  stripe: {
    enabled: true,
    secretKey: "sk_test",
    webhookSecret: "whsec",
    prices: {
      "0.5": "price_0_5",
      "1": "price_1",
      "3": "price_3",
      "6": "price_6",
      "12": "price_12",
      "24": "price_24",
      "36": "price_36",
    },
  },
  billing: { graceDays: 3 },
};

function createFakeMetering(): MeteringGateway {
  return {
    listSubscriptionItems: vi.fn(async () =>
      Object.entries(cfg.stripe.prices).map(([months, priceId]) => ({
        id: `si_${months}`,
        priceId,
      })),
    ),
    reportUsage: vi.fn(async () => undefined),
  };
}

describe("grace check", () => {
  it("deactivates cameras and marks unpaid when grace expired", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.setBillingState(tenant.id, {
      billingStatus: "past_due",
      billingGraceUntil: new Date("2026-09-10T00:00:00Z"),
      stripeSubscriptionId: "sub_1",
    });

    await runBillingJobs({
      repos,
      cfg,
      metering: createFakeMetering(),
      now: new Date("2026-09-18T00:00:00Z"),
    });

    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("unpaid");
    expect(repos.db.cameras[0]!.enabled).toBe(false);
  });

  it("keeps tenant past_due while grace is active", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.setBillingState(tenant.id, {
      billingStatus: "past_due",
      billingGraceUntil: new Date("2026-09-25T00:00:00Z"),
    });

    await runBillingJobs({
      repos,
      cfg,
      metering: createFakeMetering(),
      now: new Date("2026-09-18T00:00:00Z"),
    });

    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("past_due");
  });

  it("skips grace check when no past_due tenants", async () => {
    const repos = createFakeRepos();
    await repos.createTenant({ name: "ACME", slug: "acme" });
    await runBillingJobs({
      repos,
      cfg,
      metering: createFakeMetering(),
      now: new Date("2026-09-18T00:00:00Z"),
    });
    expect(repos.db.tenants[0]!.billingStatus).toBe("none");
  });
});

describe("usage report", () => {
  it("reports per-plan camera counts for active tenants", async () => {
    const repos = createFakeRepos();
    const metering = createFakeMetering();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.createCamera(tenant.id, {
      name: "A",
      feedType: "static_url",
      feedUrl: "https://a/x.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.createCamera(tenant.id, {
      name: "B",
      feedType: "static_url",
      feedUrl: "https://b/x.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
      planMonths: 3,
    });
    await repos.setBillingState(tenant.id, { billingStatus: "active", stripeSubscriptionId: "sub_9" });

    await runBillingJobs({
      repos,
      cfg,
      metering,
      now: new Date("2026-09-18T12:00:00Z"),
    });

    expect(metering.listSubscriptionItems).toHaveBeenCalledWith({ subscriptionId: "sub_9" });
    expect(metering.reportUsage).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionItem: "si_3", quantity: 1, timestamp: 1789732800 }),
    );
    expect(metering.reportUsage).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionItem: "si_12", quantity: 1, timestamp: 1789732800 }),
    );
  });

  it("dampens reporting to once per hour per tenant", async () => {
    const repos = createFakeRepos();
    const metering = createFakeMetering();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.setBillingState(tenant.id, { billingStatus: "active", stripeSubscriptionId: "sub_9" });

    const run = (now: Date) => runBillingJobs({ repos, cfg, metering, now });

    await run(new Date("2026-09-18T12:00:00Z"));
    await run(new Date("2026-09-18T12:30:00Z"));
    expect(metering.reportUsage).toHaveBeenCalledTimes(7);

    await run(new Date("2026-09-18T13:00:00Z"));
    expect(metering.reportUsage).toHaveBeenCalledTimes(14);
  });

  it("does not report when metering is disabled", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.setBillingState(tenant.id, { billingStatus: "active", stripeSubscriptionId: "sub_9" });
    await runBillingJobs({
      repos,
      cfg: { ...cfg, stripe: { ...cfg.stripe, enabled: false } },
      metering: null,
      now: new Date("2026-09-18T12:00:00Z"),
    });
    expect(repos.db.tenants[0]!.billingStatus).toBe("active");
  });
});