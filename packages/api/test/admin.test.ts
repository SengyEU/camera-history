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
      storageKey: "k",
      sizeBytes: 10,
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${cam.id}/preview`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().latest?.timestamp).toBe("2026-09-18T09:00:00.000Z");
    await (app as { close: () => Promise<void> }).close();
  });
});