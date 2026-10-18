import { describe, expect, it } from "vitest";
import type { Camera } from "@ch/core";
import { makeApp } from "./helpers.js";

async function seedCamera(repos: import("@ch/db").Repos): Promise<Camera> {
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
    timestamp: new Date("2026-09-18T12:00:00Z"),
    storageKey: "org/acme/cam/2026-09-18/120000.jpg",
    sizeBytes: 123,
  });
  return camera;
}

async function seedCameraWithImages(
  repos: import("@ch/db").Repos,
  opts: {
    timezone: string;
    latitude?: number | null;
    longitude?: number | null;
    timestamps: string[];
  },
): Promise<Camera> {
  const tenant = await repos.createTenant({ name: "Daylight", slug: "daylight" });
  const camera = await repos.createCamera(tenant.id, {
    name: "Daylight cam",
    feedType: "static_url",
    feedUrl: "https://example.com/cam.jpg",
    intervalMinutes: 15,
    activeFrom: "00:00",
    activeTo: "23:59",
    timezone: opts.timezone,
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
  });
  for (const timestamp of opts.timestamps) {
    const ts = new Date(timestamp);
    const stamp = ts.toISOString().replace(/[-:]/g, "").replace("T", "").slice(0, 14);
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: ts,
      storageKey: `org/daylight/${camera.id}/${ts.toISOString().slice(0, 10)}/${stamp}.jpg`,
      sizeBytes: 1,
    });
  }
  return camera;
}

describe("public routes", () => {
  it("returns camera info for widget", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera).toMatchObject({
      id: camera.id,
      name: "Main",
      timezone: "UTC",
      retentionMonths: 12,
    });
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns 404 for missing camera", async () => {
    const { app, repos } = makeApp();
    const res = await app.inject({ url: `/api/v1/cameras/does-not-exist/images?date=2026-09-18` });
    expect(res.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
    void repos;
  });

  it("returns 404 for missing camera in file route", async () => {
    const { app } = makeApp();
    const res = await app.inject({ url: "/api/v1/cameras/ghost/2026-09-18/120000.jpg" });
    expect(res.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
  });

  it("lists images for a camera on a given date", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-09-18` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cameraId).toBe(camera.id);
    expect(body.date).toBe("2026-09-18");
    expect(body.images.length).toBe(1);
    expect(body.images[0]).toMatchObject({
      url: expect.stringContaining("120000.jpg"),
      isDaylight: true,
    });
    expect(Object.keys(body.images[0]).sort()).toEqual(["id", "isDaylight", "timestamp", "url"]);
    await (app as { close: () => Promise<void> }).close();
  });

  it("marks images daylight from sun times when the camera has coordinates", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCameraWithImages(repos, {
      timezone: "America/Edmonton",
      latitude: 51.425,
      longitude: -116.177,
      timestamps: ["2026-10-18T20:00:00Z", "2026-10-18T13:00:00Z", "2026-10-18T06:00:00Z"],
    });

    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-18` });
    expect(res.statusCode).toBe(200);
    const images = res.json().images as Record<string, unknown>[];
    expect(images).toHaveLength(3);
    expect(images[0]).toMatchObject({ timestamp: "2026-10-18T06:00:00.000Z", isDaylight: false });
    expect(images[1]).toMatchObject({ timestamp: "2026-10-18T13:00:00.000Z", isDaylight: false });
    expect(images[2]).toMatchObject({ timestamp: "2026-10-18T20:00:00.000Z", isDaylight: true });
    for (const image of images) {
      expect(image).toEqual({
        id: expect.any(String),
        timestamp: expect.any(String),
        url: expect.any(String),
        isDaylight: expect.any(Boolean),
      });
    }
    await (app as { close: () => Promise<void> }).close();
  });

  it("uses each image's local date for sun times at the UTC day boundary", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCameraWithImages(repos, {
      timezone: "America/Edmonton",
      latitude: 51.425,
      longitude: -116.177,
      timestamps: ["2026-10-18T00:00:00Z", "2026-10-18T13:00:00Z"],
    });

    const local17 = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-17` });
    expect(local17.statusCode).toBe(200);
    const images17 = local17.json().images as Record<string, unknown>[];
    expect(images17).toHaveLength(1);
    expect(images17[0]).toMatchObject({ timestamp: "2026-10-18T00:00:00.000Z", isDaylight: true });

    const local18 = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-18` });
    expect(local18.statusCode).toBe(200);
    const images18 = local18.json().images as Record<string, unknown>[];
    expect(images18).toHaveLength(1);
    expect(images18[0]).toMatchObject({ timestamp: "2026-10-18T13:00:00.000Z", isDaylight: false });
    await (app as { close: () => Promise<void> }).close();
  });

  it("groups images by the camera-local calendar day", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCameraWithImages(repos, {
      timezone: "America/Edmonton",
      timestamps: ["2026-10-18T00:12:00Z"],
    });

    const local17 = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-17` });
    expect(local17.statusCode).toBe(200);
    expect(local17.json().images).toHaveLength(1);
    expect(local17.json().images[0].timestamp).toBe("2026-10-18T00:12:00.000Z");

    const local18 = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-18` });
    expect(local18.statusCode).toBe(200);
    expect(local18.json().images).toHaveLength(0);
    await (app as { close: () => Promise<void> }).close();
  });

  it("marks images by local hour when the camera has no coordinates", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCameraWithImages(repos, {
      timezone: "UTC",
      timestamps: [
        "2026-10-18T06:00:00Z",
        "2026-10-18T10:00:00Z",
        "2026-10-18T20:00:00Z",
        "2026-10-18T22:00:00Z",
      ],
    });

    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-18` });
    expect(res.statusCode).toBe(200);
    const images = res.json().images as Record<string, unknown>[];
    expect(images).toHaveLength(4);
    expect(images.map((img) => img.isDaylight)).toEqual([true, true, false, false]);
    await (app as { close: () => Promise<void> }).close();
  });

  it("uses the camera timezone for the local-hour fallback", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCameraWithImages(repos, {
      timezone: "America/Los_Angeles",
      timestamps: ["2026-10-18T04:00:00Z"],
    });

    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-10-17` });
    expect(res.statusCode).toBe(200);
    const images = res.json().images as Record<string, unknown>[];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      timestamp: "2026-10-18T04:00:00.000Z",
      isDaylight: false,
    });
    await (app as { close: () => Promise<void> }).close();
  });

  it("falls back to the local-hour window when sun times are unavailable (polar day/night)", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCameraWithImages(repos, {
      timezone: "Europe/Oslo",
      latitude: 69.65,
      longitude: 18.96,
      timestamps: ["2026-06-21T10:00:00Z", "2026-06-21T21:00:00Z"],
    });

    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-06-21` });
    expect(res.statusCode).toBe(200);
    const images = res.json().images as Record<string, unknown>[];
    expect(images).toHaveLength(2);
    expect(images.map((img) => img.isDaylight)).toEqual([true, false]);
    await (app as { close: () => Promise<void> }).close();
  });

  it("serves a stored image file", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const { app, repos } = makeApp({
      storage: {
        get: async (_key: string) => jpeg as unknown as Buffer,
        put: async () => undefined,
      },
    });
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/120000.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.rawPayload.equals(jpeg)).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("serves a stored webp file with the webp content type", async () => {
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const { app, repos } = makeApp({
      storage: {
        get: async (_key: string) => webp as unknown as Buffer,
        put: async () => undefined,
      },
    });
    const camera = await seedCamera(repos);
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: new Date("2026-09-18T13:00:00Z"),
      storageKey: "org/acme/cam/2026-09-18/130000.webp",
      sizeBytes: webp.length,
    });
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/130000.webp` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/webp");
    expect(res.rawPayload.equals(webp)).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns 404 for a jpg request when only the webp capture exists", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: new Date("2026-09-18T13:00:00Z"),
      storageKey: "org/acme/cam/2026-09-18/130000.webp",
      sizeBytes: 1,
    });
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/130000.jpg` });
    expect(res.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects unsupported file extensions", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/120000.png` });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toBe("invalid path");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects calendar-invalid dates on the images route with a 400 problem", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);

    for (const date of ["2026-02-30", "2026-13-01"]) {
      const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=${date}` });
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(res.json()).toMatchObject({
        type: "about:blank",
        title: "bad_request",
        status: 400,
        detail: "date must be a valid calendar date",
      });
    }

    const ok = await app.inject({ url: `/api/v1/cameras/${camera.id}/images?date=2026-09-18` });
    expect(ok.statusCode).toBe(200);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects calendar-invalid dates on the file route with a 400 problem", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({
      url: `/api/v1/cameras/${camera.id}/2026-02-30/120000.jpg`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().detail).toBe("date must be a valid calendar date");
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns 404 for missing image file", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/090000.jpg` });
    expect(res.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
  });

  it("exposes showNight on the public camera DTO", async () => {
    const { app, repos } = makeApp();
    const tenant = await repos.createTenant({ name: "Night", slug: "night-dto" });
    const camera = await repos.createCamera(tenant.id, {
      name: "Night cam",
      feedType: "static_url",
      feedUrl: "https://example.com/night.jpg",
      intervalMinutes: 60,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
      showNight: true,
    });
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera).toMatchObject({ id: camera.id, showNight: true });
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns public group with enabled cameras ordered by name", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-one", planMonths: 24 });
    const cam = await repos.createCamera(t.id, {
      name: "Zulu", feedType: "static_url", feedUrl: "https://e.com/z.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59",
      timezone: "America/Edmonton", theme: "dark", showNight: true,
    });
    const off = await repos.createCamera(t.id, {
      name: "Off", feedType: "static_url", feedUrl: "https://e.com/o.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC", enabled: false,
    });
    const g = await repos.createGroup(t.id, { name: "G", slug: "g-one" });
    await repos.setGroupCameras(g.id, [cam.id, off.id]);

    const res = await app.inject({ method: "GET", url: "/api/v1/groups/t-one/g-one" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.group.slug).toBe("g-one");
    expect(body.cameras).toEqual([
      {
        id: cam.id,
        name: "Zulu",
        theme: "dark",
        timezone: "America/Edmonton",
        retentionMonths: 24,
        showNight: true,
      },
    ]);
  });

  it("404s for unknown public group with a group-specific detail", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/groups/none/none" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().detail).toBe("Group not found");
  });

  it("returns latest capture date, or null when none", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-latest" });
    const cam = await repos.createCamera(t.id, {
      name: "C", feedType: "static_url", feedUrl: "https://e.com/c.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: cam.id, timestamp: new Date("2026-10-10T09:00:00Z"),
      storageKey: "org/x/2026-10-10/090000.jpg", sizeBytes: 1,
    });

    const ok = await app.inject({ method: "GET", url: `/api/v1/cameras/${cam.id}/latest` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().date).toBe("2026-10-10");

    const empty = await repos.createCamera(t.id, {
      name: "E", feedType: "static_url", feedUrl: "https://e.com/e.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const none = await app.inject({ method: "GET", url: `/api/v1/cameras/${empty.id}/latest` });
    expect(none.json()).toEqual({ date: null });

    const missing = await app.inject({ method: "GET", url: "/api/v1/cameras/00000000-0000-0000-0000-000000000000/latest" });
    expect(missing.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns the camera-local date for a latest capture near UTC midnight", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-latest-tz" });
    const cam = await repos.createCamera(t.id, {
      name: "C", feedType: "static_url", feedUrl: "https://e.com/c.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "America/Edmonton",
    });
    await repos.insertImage({
      cameraId: cam.id, timestamp: new Date("2026-10-18T02:00:00Z"),
      storageKey: "org/x/2026-10-17/200000.jpg", sizeBytes: 1,
    });

    const res = await app.inject({ method: "GET", url: `/api/v1/cameras/${cam.id}/latest` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ date: "2026-10-17", timestamp: "2026-10-18T02:00:00.000Z" });
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns a 400 problem for an invalid camera timezone on latest and images", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-bad-tz" });
    const cam = await repos.createCamera(t.id, {
      name: "Bad tz", feedType: "static_url", feedUrl: "https://e.com/b.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "Not/AZone",
    });
    await repos.insertImage({
      cameraId: cam.id, timestamp: new Date("2026-10-10T09:00:00Z"),
      storageKey: "org/x/2026-10-10/090000.jpg", sizeBytes: 1,
    });

    const latest = await app.inject({ method: "GET", url: `/api/v1/cameras/${cam.id}/latest` });
    expect(latest.statusCode).toBe(400);
    expect(latest.headers["content-type"]).toContain("application/problem+json");
    expect(latest.json()).toMatchObject({
      type: "about:blank",
      title: "bad_request",
      status: 400,
      detail: "camera timezone is invalid",
    });

    const images = await app.inject({
      url: `/api/v1/cameras/${cam.id}/images?date=2026-10-10`,
    });
    expect(images.statusCode).toBe(400);
    expect(images.headers["content-type"]).toContain("application/problem+json");
    await (app as { close: () => Promise<void> }).close();
  });
});