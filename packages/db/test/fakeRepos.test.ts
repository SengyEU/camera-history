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
    expect(pub?.timezone).toBe("UTC");
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

  it("defaults and roundtrips coordinates and daylightOnly", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const plain = await repos.createCamera(tenant.id, {
      name: "Plain",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    expect(plain.latitude).toBeNull();
    expect(plain.longitude).toBeNull();
    expect(plain.daylightOnly).toBe(false);

    const plainPub = await repos.getPublicCamera(plain.id);
    expect(plainPub?.latitude).toBeNull();
    expect(plainPub?.longitude).toBeNull();

    const withCoords = await repos.createCamera(tenant.id, {
      name: "Geo",
      feedType: "static_url",
      feedUrl: "https://example.com/geo.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "America/Edmonton",
      latitude: 51.425,
      longitude: -116.177,
      daylightOnly: true,
    });
    expect(withCoords.latitude).toBe(51.425);
    expect(withCoords.longitude).toBe(-116.177);
    expect(withCoords.daylightOnly).toBe(true);

    const pub = await repos.getPublicCamera(withCoords.id);
    expect(pub?.latitude).toBe(51.425);
    expect(pub?.longitude).toBe(-116.177);

    const updated = await repos.updateCamera(plain.id, { latitude: 50.08, longitude: 14.42, daylightOnly: true });
    expect(updated?.latitude).toBe(50.08);
    expect(updated?.longitude).toBe(14.42);
    expect(updated?.daylightOnly).toBe(true);

    const cleared = await repos.updateCamera(plain.id, { latitude: null, longitude: null, daylightOnly: false });
    expect(cleared?.latitude).toBeNull();
    expect(cleared?.longitude).toBeNull();
    expect(cleared?.daylightOnly).toBe(false);
  });

  it("defaults and roundtrips showNight, including group resolve", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const plain = await repos.createCamera(tenant.id, {
      name: "Plain",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    expect(plain.showNight).toBe(false);
    expect((await repos.getPublicCamera(plain.id))?.showNight).toBe(false);

    const night = await repos.createCamera(tenant.id, {
      name: "Night",
      feedType: "static_url",
      feedUrl: "https://example.com/night.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
      showNight: true,
    });
    expect(night.showNight).toBe(true);
    expect((await repos.getPublicCamera(night.id))?.showNight).toBe(true);

    const updated = await repos.updateCamera(plain.id, { showNight: true });
    expect(updated?.showNight).toBe(true);
    const reverted = await repos.updateCamera(plain.id, { showNight: false });
    expect(reverted?.showNight).toBe(false);

    const group = await repos.createGroup(tenant.id, { name: "G", slug: "g" });
    await repos.setGroupCameras(group.id, [plain.id, night.id]);
    const pub = await repos.getGroupBySlug("acme", "g");
    expect(pub?.cameras.map((c) => [c.name, c.showNight, c.timezone, c.retentionMonths])).toEqual([
      ["Night", true, "UTC", 12],
      ["Plain", false, "UTC", 12],
    ]);
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
    const stats = await repos.cameraStats(tenant.id);
    expect(stats.get(cam.id)).toEqual({
      imageCount: 2,
      totalBytes: 250,
      firstCaptureAt: "2026-09-18T09:00:00.000Z",
      lastCaptureAt: "2026-09-20T09:00:00.000Z",
    });
    expect((await repos.cameraStats("missing")).size).toBe(0);
  });

  it("enables/disables all tenant cameras and toggles billing state", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    await repos.createCamera(tenant.id, {
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