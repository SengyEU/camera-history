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

  it("creates camera with default status and updates it", async () => {
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
    expect(camera.status).toBe("operational");
    const updated = await repos.updateCamera(camera.id, { status: "offline", lastError: "boom" });
    expect(updated?.status).toBe("offline");
  });

  it("counts cameras and reports usage stats for a tenant", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const cam = await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.insertImage({ cameraId: cam.id, timestamp: new Date("2026-09-18T09:00:00Z"), storageKey: "k1", sizeBytes: 100 });
    await repos.insertImage({ cameraId: cam.id, timestamp: new Date("2026-09-20T09:00:00Z"), storageKey: "k2", sizeBytes: 150 });
    expect(await repos.countCameras(tenant.id)).toBe(1);
    expect(await repos.usageStats(tenant.id)).toEqual({ usageBytes: 250, spanDays: 2 });
    expect(await repos.usageStats("missing")).toEqual({ usageBytes: 0, spanDays: 0 });
  });

  it("enables/disables all tenant cameras and toggles billing state", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const cam = await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.setTenantCamerasEnabled(tenant.id, false);
    expect(repos.db.cameras[0]!.enabled).toBe(false);
    await repos.setBillingState(tenant.id, { billingStatus: "past_due", billingGraceUntil: new Date("2026-10-01T00:00:00Z") });
    expect(repos.db.tenants[0]!.billingStatus).toBe("past_due");
    const listed = await repos.listTenantsByBillingStatus("past_due");
    expect(listed.map((t) => t.id)).toContain(tenant.id);
  });
});