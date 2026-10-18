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

describe("public routes", () => {
  it("returns camera info for widget", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera).toMatchObject({ id: camera.id, name: "Main", retentionMonths: 12 });
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
    expect(body.images[0]).toMatchObject({ url: expect.stringContaining("120000.jpg") });
    await (app as { close: () => Promise<void> }).close();
  });

  it("serves a stored image file", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const { app, repos } = makeApp({
      storage: { get: async (_key: string) => jpeg as unknown as Buffer },
    });
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/120000.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.rawPayload.equals(jpeg)).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns 404 for missing image file", async () => {
    const { app, repos } = makeApp();
    const camera = await seedCamera(repos);
    const res = await app.inject({ url: `/api/v1/cameras/${camera.id}/2026-09-18/090000.jpg` });
    expect(res.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns public group with enabled cameras ordered by name", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-one" });
    const cam = await repos.createCamera(t.id, {
      name: "Zulu", feedType: "static_url", feedUrl: "https://e.com/z.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC", theme: "dark",
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
    expect(body.cameras).toEqual([{ id: cam.id, name: "Zulu", theme: "dark" }]);
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
  });
});