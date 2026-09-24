import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.js";

async function registerAndLogin(app: ReturnType<typeof makeApp>["app"]) {
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "a@acme.cz", password: "password123" },
  });
  return (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!).join("; ");
}

describe("admin cameras", () => {
  it("lists cameras for own tenant only", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const other = await repos.createTenant({ name: "Other", slug: "other" });
    await repos.createCamera(other.id, {
      name: "Other cam",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/cameras", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().cameras).toHaveLength(0);
    await (app as { close: () => Promise<void> }).close();
  });

  it("creates a camera", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Main",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().camera).toMatchObject({ id: expect.any(String), feedType: "static_url" });
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects bad interval", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg", intervalMinutes: 7 },
    });
    expect(res.statusCode).toBe(400);
    await (app as { close: () => Promise<void> }).close();
  });

  it("requires auth", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/cameras" });
    expect(res.statusCode).toBe(401);
    await (app as { close: () => Promise<void> }).close();
  });

  it("creates a camera with a chosen theme", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Forest",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        theme: "forest",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().camera.theme).toBe("forest");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects an unknown theme on create", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Main",
        feedType: "static_url",
        feedUrl: "https://x/cam.jpg",
        intervalMinutes: 15,
        theme: "neon",
      },
    });
    expect(res.statusCode).toBe(400);
    await (app as { close: () => Promise<void> }).close();
  });

  it("updates the camera theme", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg", intervalMinutes: 15 },
    });
    const id = created.json().camera.id as string;
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { theme: "midnight" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera.theme).toBe("midnight");
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns 404 for camera of another tenant", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const otherTenant = await repos.createTenant({ name: "Other", slug: "other" });
    const cam = await repos.createCamera(otherTenant.id, {
      name: "Other cam",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${cam.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns preview latest image", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const cam = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: cam.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: `org/acme/${cam.id}/2026-09-18/090000.jpg`,
      sizeBytes: 10,
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${cam.id}/preview`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().latest?.timestamp).toBe("2026-09-18T09:00:00.000Z");
    expect(res.json().latest.url).toContain("/api/v1/cameras/");
    await (app as { close: () => Promise<void> }).close();
  });
});

describe("admin feed type validation", () => {
  it("accepts a custom camera with wss scheme", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Kite cam",
        feedType: "custom",
        feedUrl: "wss://cam.kitesportcentre.com/gl-cam",
        intervalMinutes: 5,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().camera.feedType).toBe("custom");
    await (app as { close: () => Promise<void> }).close();
  });

  it("accepts an rtsp camera", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "IP cam", feedType: "rtsp", feedUrl: "rtsp://cam:554/stream", intervalMinutes: 15 },
    });
    expect(res.statusCode).toBe(201);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects custom camera without wss scheme", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "Kite", feedType: "custom", feedUrl: "https://cam/k", intervalMinutes: 15 },
    });
    expect(res.statusCode).toBe(400);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects rtsp scheme for a static_url camera", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "Bad", feedType: "static_url", feedUrl: "rtsp://cam/stream", intervalMinutes: 15 },
    });
    expect(res.statusCode).toBe(400);
    await (app as { close: () => Promise<void> }).close();
  });
});

describe("admin camera preview", () => {
  it("returns a public image url for the latest image", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const cam = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: cam.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: `org/${tenant.slug}/${cam.id}/2026-09-18/090000.jpg`,
      sizeBytes: 400,
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${cam.id}/preview`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().latest.url).toBe(
      `http://localhost:8080/api/v1/cameras/${cam.id}/2026-09-18/090000.jpg`,
    );
    await (app as { close: () => Promise<void> }).close();
  });
});