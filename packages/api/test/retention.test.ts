import { describe, expect, it } from "vitest";
import { dayRangeUtc, gatedRange, retentionCutoff } from "@ch/core";
import { makeApp } from "./helpers.js";

const todayStr = new Date().toISOString().slice(0, 10);

describe("retention", () => {
  it("retentionCutoff returns date 12 months earlier", () => {
    const r = retentionCutoff(12, new Date("2026-09-18T00:00:00Z"));
    expect(r.getUTCFullYear()).toBe(2025);
    expect(r.getUTCMonth()).toBe(8); // September
  });

  it("dayRangeUtc returns two boundaries", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    expect(start.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("gatedRange clamps the window to the cutoff", () => {
    const cutoff = retentionCutoff(12, new Date("2026-09-18T12:00:00Z"));
    const { start, end } = dayRangeUtc("2024-07-04");
    const gated = gatedRange(start, end, cutoff);
    expect(gated.start.toISOString()).toBe(cutoff.toISOString());
    expect(gated.end.toISOString()).toBe(cutoff.toISOString());
  });

  it("respects tenant planMonths", async () => {
    const { app, repos } = makeApp();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme", planMonths: 6 });
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: new Date(`${todayStr}T12:00:00Z`),
      storageKey: `org/acme/cam/${todayStr}/120000.jpg`,
      sizeBytes: 123,
    });
    const res = await app.inject({ url: `/v1/cameras/${camera.id}/images?date=${todayStr}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().images).toHaveLength(1);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns empty array for dates before retention cutoff", async () => {
    const { app, repos } = makeApp();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: new Date("2024-01-01T12:00:00Z"),
      storageKey: "org/acme/cam/2024-01-01/120000.jpg",
      sizeBytes: 123,
    });
    const res = await app.inject({ url: `/v1/cameras/${camera.id}/images?date=2024-01-01` });
    expect(res.statusCode).toBe(200);
    expect(res.json().images).toEqual([]);
    await (app as { close: () => Promise<void> }).close();
  });
});