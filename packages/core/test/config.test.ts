import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("fills defaults", () => {
    const cfg = loadConfig({});
    expect(cfg.worker.tickMs).toBe(60000);
    expect("plan" in cfg).toBe(false);
  });

  it("loads DATABASE_URL", () => {
    const cfg = loadConfig({ DATABASE_URL: "postgres://a:b@h:5432/db" });
    expect(cfg.databaseUrl).toBe("postgres://a:b@h:5432/db");
  });

  it("reads feed limits", () => {
    const cfg = loadConfig({ FEED_MAX_BYTES: "1000" });
    expect(cfg.feed.maxBytes).toBe(1000);
  });

  it("parses MINIO_USE_SSL=false as boolean false", () => {
    expect(loadConfig({ MINIO_USE_SSL: "false" }).minio.useSsl).toBe(false);
    expect(loadConfig({ MINIO_USE_SSL: "true" }).minio.useSsl).toBe(true);
    expect(loadConfig({}).minio.useSsl).toBe(false);
  });

  it("loads stripe and billing config with package price keys", () => {
    const cfg = loadConfig({
      STRIPE_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_y",
      STRIPE_PRICE_SOLO: "price_solo",
      STRIPE_PRICE_STARTER: "price_starter",
      STRIPE_PRICE_PLUS: "price_plus",
      STRIPE_PRICE_PRO: "price_pro",
      STRIPE_PRICE_NETWORK: "price_network",
      STRIPE_PORTAL_CONFIG_ID: "bpc_123",
      BILLING_GRACE_DAYS: "5",
    });
    expect(cfg.stripe).toMatchObject({
      enabled: true,
      secretKey: "sk_test_x",
      webhookSecret: "whsec_y",
      prices: {
        solo: "price_solo",
        starter: "price_starter",
        plus: "price_plus",
        pro: "price_pro",
        network: "price_network",
      },
    });
    expect(cfg.billing.graceDays).toBe(5);
    expect(cfg.stripe.portalConfigId).toBe("bpc_123");
  });

  it("defaults stripe to disabled with empty prices", () => {
    const cfg = loadConfig({});
    expect(cfg.stripe.enabled).toBe(false);
    expect(cfg.stripe.prices).toEqual({});
    expect(cfg.billing.graceDays).toBe(7);
  });
});
