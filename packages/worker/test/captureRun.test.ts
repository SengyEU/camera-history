import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@ch/core";
import { createFakeRepos } from "@ch/db";
import { captureBuffer } from "../src/adapters/index.js";
import { runSchedule } from "../src/captureRun.js";

const cfg: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
};

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const sleep = vi.fn(async () => undefined);
const storage = { put: async () => undefined, get: async () => JPG };

let server: Server;
let feedUrl = "";

beforeEach(async () => {
  sleep.mockClear();
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(JPG);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") feedUrl = `http://127.0.0.1:${addr.port}/cam.jpg`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("runSchedule", () => {
  it("captures due camera, inserts image, clears error and marks operational", async () => {
    const fakes = createFakeRepos();
    const db = fakes.db;
    const tenant = await fakes.createTenant({ name: "ACME", slug: "acme" });
    const camera = await fakes.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl,
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });

    const processed = await runSchedule({
      repos: fakes,
      storage,
      cfg,
      now: new Date("2026-09-18T09:00:00Z"),
      log: () => {},
      sleep,
    });

    expect(processed).toBe(1);
    expect(db.images).toHaveLength(1);
    expect(db.images[0]).toMatchObject({ cameraId: camera.id, sizeBytes: JPG.length });
    expect(db.cameras[0]!.lastCaptureAt).not.toBeNull();
    expect(db.cameras[0]!.lastError).toBeNull();
    expect(db.cameras[0]!.status).toBe("operational");
  });

  it("skips cameras outside active window", async () => {
    const fakes = createFakeRepos();
    const tenant = await fakes.createTenant({ name: "ACME", slug: "acme" });
    await fakes.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "09:00",
      activeTo: "10:00",
      timezone: "UTC",
    });
    const processed = await runSchedule({
      repos: fakes,
      storage,
      cfg,
      now: new Date("2026-09-18T15:00:00Z"),
      log: () => {},
      sleep,
    });
    expect(processed).toBe(0);
  });

  it("retries once, waits backoff, marks camera delayed after failure", async () => {
    const fakes = createFakeRepos();
    const db = fakes.db;
    const tenant = await fakes.createTenant({ name: "ACME", slug: "acme" });
    await fakes.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "http://127.0.0.1:1/dead.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await runSchedule({ repos: fakes, storage, cfg, now: new Date("2026-09-18T09:00:00Z"), log: () => {}, sleep });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(30000);
    expect(db.images).toHaveLength(0);
    expect(db.cameras[0]!.status).toBe("delayed");
    expect(db.cameras[0]!.lastError).toBeTruthy();
  });

  it("escalates a repeated failure to offline", async () => {
    const fakes = createFakeRepos();
    const db = fakes.db;
    const tenant = await fakes.createTenant({ name: "ACME", slug: "acme" });
    const camera = await fakes.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "http://127.0.0.1:1/dead.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await fakes.updateCamera(camera.id, { status: "delayed", lastError: "old" });

    await runSchedule({ repos: fakes, storage, cfg, now: new Date("2026-09-18T09:00:00Z"), log: () => {}, sleep });
    expect(db.cameras[0]!.status).toBe("offline");
  });
});

void captureBuffer;
void sleep;
