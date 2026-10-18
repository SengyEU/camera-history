import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@ch/core";
import { createObjectStorage, ensureBucketExists, keyFor } from "../src/storage.js";

const minio = vi.hoisted(() => ({
  putObject: vi.fn(async () => undefined),
  bucketExists: vi.fn(async () => true),
}));

vi.mock("minio", () => ({
  Client: class {
    bucketExists = minio.bucketExists;
    makeBucket = vi.fn(async () => undefined);
    putObject = minio.putObject;
    getObject = vi.fn();
  },
}));

const testConfig = {
  databaseUrl: "postgres://camera:camera@127.0.0.1:5432/camera_history",
  minio: { endpoint: "x", port: 9000, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
  stripe: { enabled: false, secretKey: "", webhookSecret: "", prices: {} },
  billing: { graceDays: 3 },
} satisfies AppConfig;

describe("keyFor", () => {
  it("builds org/{slug}/{camera}/{YYYY-MM-DD}/{HHMMSS}.jpg (UTC)", () => {
    const ts = new Date("2026-09-18T09:05:03Z");
    expect(keyFor("acme", "cam-1", ts)).toBe("org/acme/cam-1/2026-09-18/090503.jpg");
  });
});

describe("createObjectStorage.put", () => {
  it("labels objects by key extension", async () => {
    minio.putObject.mockClear();
    const storage = createObjectStorage(testConfig);
    await storage.put("org/acme/cam/2026-10-18/100000.webp", Buffer.from("webp"));
    await storage.put("org/acme/cam/2026-10-18/090000.jpg", Buffer.from("jpeg"));

    expect(minio.putObject).toHaveBeenNthCalledWith(
      1,
      "org",
      "org/acme/cam/2026-10-18/100000.webp",
      expect.any(Buffer),
      4,
      { "Content-Type": "image/webp" },
    );
    expect(minio.putObject).toHaveBeenNthCalledWith(
      2,
      "org",
      "org/acme/cam/2026-10-18/090000.jpg",
      expect.any(Buffer),
      4,
      { "Content-Type": "image/jpeg" },
    );
  });
});

describe("ensureBucketExists", () => {
  it("creates the bucket when it is missing", async () => {
    const made: string[] = [];
    const client = {
      bucketExists: async () => false,
      makeBucket: async (bucket: string) => {
        made.push(bucket);
      },
    };
    await ensureBucketExists(client, "org");
    expect(made).toEqual(["org"]);
  });

  it("is idempotent across repeated calls (never re-creates an existing bucket)", async () => {
    let exists = false;
    const made: string[] = [];
    const client = {
      bucketExists: async () => exists,
      makeBucket: async (bucket: string) => {
        exists = true;
        made.push(bucket);
      },
    };
    await ensureBucketExists(client, "org");
    await ensureBucketExists(client, "org");
    expect(made).toEqual(["org"]);
  });

  it("does not create the bucket when it already exists", async () => {
    let makeBucketCalls = 0;
    const client = {
      bucketExists: async () => true,
      makeBucket: async (_bucket: string) => {
        makeBucketCalls++;
      },
    };
    await ensureBucketExists(client, "org");
    expect(makeBucketCalls).toBe(0);
  });
});
