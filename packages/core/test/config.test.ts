import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("fills defaults", () => {
    const cfg = loadConfig({});
    expect(cfg.worker.tickMs).toBe(60000);
    expect(cfg.plan.defaultRetentionMonths).toBe(12);
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
});