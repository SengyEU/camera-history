import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { createFakeRepos } from "@ch/db";
import { buildApp } from "../src/app.js";
import type { StripeGateway } from "../src/stripe/gateway.js";

export const testConfig: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
  stripe: { enabled: false, secretKey: "", webhookSecret: "", prices: {} },
  billing: { graceDays: 3 },
};

export function defineFakeStripeGateway(over: Partial<StripeGateway> = {}): StripeGateway {
  return {
    createCustomer: over.createCustomer ?? (async () => ({ id: "cus_123" })),
    createCheckoutSession:
      over.createCheckoutSession ??
      (async () => ({ url: "https://checkout.stripe.com/test", customer: "cus_123", subscription: "sub_123" })),
    updateSubscription: over.updateSubscription ?? (async () => undefined),
    createPortalSession: over.createPortalSession ?? (async () => ({ url: "https://billing.stripe.com/test" })),
    verifyWebhook:
      over.verifyWebhook ??
      (async () => ({
        type: "customer.subscription.updated",
        data: { object: { metadata: { tenantId: "" } } },
      })),
  };
}

export function makeApp(overrides: {
  repos?: Repos;
  storage?: ObjectStorage;
  cfg?: AppConfig;
  stripe?: StripeGateway | null;
} = {}) {
  const fakes = createFakeRepos();
  const repos = overrides.repos ?? fakes;
  const storage = overrides.storage ?? {
    get: async (key: string) => Buffer.from(`bytes:${key}`) as unknown as Buffer,
    put: async () => undefined,
  };
  const cfg = overrides.cfg ?? testConfig;
  const app = buildApp({
    cfg,
    repos,
    storage,
    stripe: overrides.stripe !== undefined ? overrides.stripe : null,
  });
  return { app, repos };
}