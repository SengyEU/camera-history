import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { createFakeRepos } from "@ch/db";
import { buildApp } from "../src/app.js";

export const testConfig: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
};

export function makeApp(overrides: { repos?: Repos; storage?: ObjectStorage } = {}) {
  const fakes = createFakeRepos();
  const repos = overrides.repos ?? fakes;
  const storage = overrides.storage ?? {
    get: async (key: string) => Buffer.from(`bytes:${key}`) as unknown as Buffer,
  };
  const app = buildApp({
    cfg: testConfig,
    repos,
    storage,
  });
  return { app, repos };
}