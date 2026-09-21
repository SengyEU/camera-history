import { describe, expect, it } from "vitest";
import { createFakeRepos } from "../src/testing/fakeRepos.js";

const newTenant = { name: "ACME", slug: "acme" };

describe("fakeRepos", () => {
  it("creates tenant and camera", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    expect(tenant.planMonths).toBe(12);

    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    expect(camera.tenantId).toBe(tenant.id);
  });

  it("inserts and queries images within a day range", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
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
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: "key-1",
      sizeBytes: 100,
    });
    const rows = await repos.imagesForCameraDay(
      camera.id,
      new Date("2026-09-18T00:00:00Z"),
      new Date("2026-09-19T00:00:00Z"),
    );
    expect(rows).toHaveLength(1);
  });

  it("returns public camera with plan retention", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ ...newTenant, planMonths: 24 });
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const pub = await repos.getPublicCamera(camera.id);
    expect(pub?.retentionMonths).toBe(24);
  });
});