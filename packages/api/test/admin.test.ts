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

async function registerTenant(
  app: ReturnType<typeof makeApp>["app"],
  name: string,
  slug: string,
  email: string,
) {
  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name, slug, email, password: "password1" },
  });
  return {
    cookie: reg.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    tenantId: reg.json().tenantId as string,
  };
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

  it("creates a custom theme camera and validates its colors", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const colors = {
      bg: "#101010",
      surface: "#1a1a1a",
      ink: "#f5f5f5",
      muted: "#b0b0b0",
      line: "#333333",
      accent: "#7fbf9a",
      onAccent: "#101010",
      pine: "#3f9e6f",
      onPine: "#06231a",
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Custom",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        theme: "custom",
        themeColors: colors,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().camera.themeColors).toEqual(colors);

    const missing = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "No colors",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        theme: "custom",
      },
    });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Bad colors",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        theme: "custom",
        themeColors: { ...colors, bg: "red" },
      },
    });
    expect(invalid.statusCode).toBe(400);

    const publicRes = await app.inject({ method: "GET", url: `/api/v1/cameras/${created.json().camera.id}` });
    expect(publicRes.statusCode).toBe(200);
    expect(publicRes.json().camera.themeColors).toEqual(colors);
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

describe("admin camera coordinates", () => {
  it("creates a camera with coordinates and daylightOnly, and returns them on GET", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Geo",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        latitude: 51.425,
        longitude: -116.177,
        daylightOnly: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const camera = res.json().camera;
    expect(camera).toMatchObject({ latitude: 51.425, longitude: -116.177, daylightOnly: true });

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${camera.id}`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().camera).toMatchObject({
      latitude: 51.425,
      longitude: -116.177,
      daylightOnly: true,
    });
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects daylightOnly without coordinates on create", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Geo",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        daylightOnly: true,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("bad_request");
    expect(res.json().detail).toBe(
      "latitude and longitude are required when daylightOnly is enabled",
    );
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects out-of-range and non-numeric coordinates on create", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const base = {
      name: "Geo",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
    };

    const badLatitude = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { ...base, latitude: 100, longitude: 0 },
    });
    expect(badLatitude.statusCode).toBe(400);
    expect(badLatitude.json().title).toBe("bad_request");

    const badLongitude = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { ...base, latitude: 0, longitude: -200 },
    });
    expect(badLongitude.statusCode).toBe(400);
    expect(badLongitude.json().title).toBe("bad_request");

    const nonNumeric = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { ...base, latitude: "x", longitude: 0 },
    });
    expect(nonNumeric.statusCode).toBe(400);
    expect(nonNumeric.json().title).toBe("bad_request");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects non-boolean daylightOnly on create and update", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const base = {
      name: "Geo",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      latitude: 51.425,
      longitude: -116.177,
    };

    const post = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { ...base, daylightOnly: "false" },
    });
    expect(post.statusCode).toBe(400);
    expect(post.json().title).toBe("bad_request");
    expect(post.json().detail).toBe("daylightOnly must be a boolean");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: base,
    });
    const id = created.json().camera.id as string;
    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { daylightOnly: "false" },
    });
    expect(put.statusCode).toBe(400);
    expect(put.json().title).toBe("bad_request");
    expect(put.json().detail).toBe("daylightOnly must be a boolean");
    await (app as { close: () => Promise<void> }).close();
  });

  it("clears coordinates via PUT when daylightOnly is disabled", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Geo",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        latitude: 51.425,
        longitude: -116.177,
        daylightOnly: false,
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().camera.id as string;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { latitude: null, longitude: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera).toMatchObject({ latitude: null, longitude: null, daylightOnly: false });

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().camera).toMatchObject({
      latitude: null,
      longitude: null,
      daylightOnly: false,
    });
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects enabling daylightOnly via PUT when the camera has no coordinates", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Geo",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
      },
    });
    const id = created.json().camera.id as string;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { daylightOnly: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("bad_request");
    expect(res.json().detail).toBe(
      "latitude and longitude are required when daylightOnly is enabled",
    );
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects clearing coordinates via PUT while daylightOnly stays enabled", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Geo",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        latitude: 51.425,
        longitude: -116.177,
        daylightOnly: true,
      },
    });
    const id = created.json().camera.id as string;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { latitude: null },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("bad_request");
    await (app as { close: () => Promise<void> }).close();
  });

  it("enables daylightOnly via PUT when the camera already has coordinates", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Geo",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        latitude: 51.425,
        longitude: -116.177,
      },
    });
    const id = created.json().camera.id as string;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { daylightOnly: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera).toMatchObject({
      latitude: 51.425,
      longitude: -116.177,
      daylightOnly: true,
    });
    await (app as { close: () => Promise<void> }).close();
  });
});

describe("admin camera showNight", () => {
  it("creates a camera with showNight and returns it on GET", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Night",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        showNight: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().camera.showNight).toBe(true);

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${res.json().camera.id as string}`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().camera.showNight).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("defaults showNight to false and updates it via PUT", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Day",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().camera.showNight).toBe(false);

    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${created.json().camera.id as string}`,
      headers: { cookie },
      payload: { showNight: true },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().camera.showNight).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects a non-boolean showNight on create and update", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const base = {
      name: "Night",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
    };

    const post = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { ...base, showNight: "false" },
    });
    expect(post.statusCode).toBe(400);
    expect(post.json().title).toBe("bad_request");
    expect(post.json().detail).toBe("showNight must be a boolean");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: base,
    });
    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${created.json().camera.id as string}`,
      headers: { cookie },
      payload: { showNight: "false" },
    });
    expect(put.statusCode).toBe(400);
    expect(put.json().title).toBe("bad_request");
    expect(put.json().detail).toBe("showNight must be a boolean");
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

describe("admin groups", () => {
  it("creates, lists, updates, sets cameras and deletes a group", async () => {
    const { app, repos } = makeApp();
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "G", slug: "grp-admin", email: "g@x.dev", password: "password1" },
    });
    const cookie = reg.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const tenantId = reg.json().tenantId as string;
    const cam = await repos.createCamera(tenantId, {
      name: "C1",
      feedType: "static_url",
      feedUrl: "https://e.com/c.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().group).toEqual({
      id: expect.any(String),
      name: "Summit",
      slug: "summit",
      cameraIds: [],
    });
    expect(created.json().group).not.toHaveProperty("tenantId");
    const gid = created.json().group.id as string;

    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie },
      payload: { name: "Dup", slug: "summit" },
    });
    expect(dup.statusCode).toBe(409);

    const put1 = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie },
      payload: { cameraIds: [cam.id] },
    });
    expect(put1.statusCode).toBe(204);
    const put2 = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie },
      payload: { cameraIds: [cam.id] },
    });
    expect(put2.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().groups.find((g: { id: string }) => g.id === gid).cameraIds).toEqual([cam.id]);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie },
      payload: { name: "Summit2" },
    });
    expect(patched.json().group.name).toBe("Summit2");

    const del = await app.inject({ method: "DELETE", url: `/api/v1/admin/groups/${gid}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/v1/admin/groups/${gid}`, headers: { cookie } })).statusCode).toBe(404);
  });

  it("returns the tenant slug for embed snippets", async () => {
    const { app } = makeApp();
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "T", slug: "slug-src", email: "s@x.dev", password: "password1" },
    });
    const cookie = reg.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/tenant", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().tenant.slug).toBe("slug-src");
  });

  it("returns 404 for group routes owned by another tenant", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "tenant-a", "a@tenant-a.dev");
    const b = await registerTenant(app, "B", "tenant-b", "b@tenant-b.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    expect(created.statusCode).toBe(201);
    const gid = created.json().group.id as string;

    const get = await app.inject({ method: "GET", url: `/api/v1/admin/groups/${gid}`, headers: { cookie: b.cookie } });
    expect(get.statusCode).toBe(404);
    expect(get.headers["content-type"]).toContain("application/problem+json");

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: b.cookie },
      payload: { name: "Hijacked" },
    });
    expect(patch.statusCode).toBe(404);

    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie: b.cookie },
      payload: { cameraIds: [] },
    });
    expect(put.statusCode).toBe(404);

    const del = await app.inject({ method: "DELETE", url: `/api/v1/admin/groups/${gid}`, headers: { cookie: b.cookie } });
    expect(del.statusCode).toBe(404);

    const listA = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: a.cookie } });
    expect(listA.json().groups.map((g: { id: string }) => g.id)).toContain(gid);
    const listB = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: b.cookie } });
    expect(listB.json().groups).toHaveLength(0);
  });

  it("ignores tenantId sent in a group patch", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "mass-a", "a@mass-a.dev");
    const b = await registerTenant(app, "B", "mass-b", "b@mass-b.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
      payload: { tenantId: b.tenantId, name: "Renamed" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().group.name).toBe("Renamed");

    const listA = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: a.cookie } });
    expect(listA.json().groups.map((g: { id: string }) => g.id)).toContain(gid);
    const listB = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: b.cookie } });
    expect(listB.json().groups).toHaveLength(0);
  });

  it("rejects a bodiless create request", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "bodiless-a", "a@bodiless.dev");
    const res = await app.inject({ method: "POST", url: "/api/v1/admin/groups", headers: { cookie: a.cookie } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-lowercase slug on create", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "badslug-a", "a@badslug.dev");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Bad", slug: "Bad Slug" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects create without a name", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "noname-a", "a@noname.dev");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { slug: "no-name" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects non-string name or slug values", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "nonstring-a", "a@nonstring.dev");
    const post = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: 42, slug: "valid-slug" },
    });
    expect(post.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
      payload: { slug: 123 },
    });
    expect(patch.statusCode).toBe(400);
  });

  it("rejects invalid cameraIds payloads", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "camids-a", "a@camids.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;

    const notArray = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie: a.cookie },
      payload: {},
    });
    expect(notArray.statusCode).toBe(400);

    const mixed = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie: a.cookie },
      payload: { cameraIds: ["ok", 123] },
    });
    expect(mixed.statusCode).toBe(400);
  });

  it("rejects patching to a taken slug but allows keeping the own slug", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "slugconflict-a", "a@slugconflict.dev");
    const g1 = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "One", slug: "one" },
    });
    const g2 = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Two", slug: "two" },
    });
    const gid1 = g1.json().group.id as string;
    const gid2 = g2.json().group.id as string;

    const conflict = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid1}`,
      headers: { cookie: a.cookie },
      payload: { slug: "two" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().title).toBe("conflict");

    const ownSlug = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid1}`,
      headers: { cookie: a.cookie },
      payload: { slug: "one" },
    });
    expect(ownSlug.statusCode).toBe(200);
    expect(ownSlug.json().group.slug).toBe("one");

    const stillTwo = await app.inject({ method: "GET", url: `/api/v1/admin/groups/${gid2}`, headers: { cookie: a.cookie } });
    expect(stillTwo.json().group.slug).toBe("two");
  });

  it("rejects a bodiless group patch", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "patch-bodiless-a", "a@patch-bodiless.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("bad_request");
  });

  it("rejects an empty object group patch", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "patch-empty-a", "a@patch-empty.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("bad_request");
  });

  it("rejects a group patch with only an unknown key", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "patch-unknown-a", "a@patch-unknown.dev");
    const b = await registerTenant(app, "B", "patch-unknown-b", "b@patch-unknown.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
      payload: { tenantId: b.tenantId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("bad_request");

    const relist = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: a.cookie } });
    expect(relist.json().groups.find((g: { id: string }) => g.id === gid).name).toBe("Summit");
  });

  it("still renames with a name patch and accepts the own slug", async () => {
    const { app } = makeApp();
    const a = await registerTenant(app, "A", "patch-name-a", "a@patch-name.dev");
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
      payload: { name: "Summit2" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().group.name).toBe("Summit2");

    const ownSlug = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/groups/${gid}`,
      headers: { cookie: a.cookie },
      payload: { slug: "summit" },
    });
    expect(ownSlug.statusCode).toBe(200);
    expect(ownSlug.json().group.slug).toBe("summit");
  });

  it("sets group membership from the tenant's own cameras", async () => {
    const { app, repos } = makeApp();
    const a = await registerTenant(app, "A", "owncams-a", "a@owncams.dev");
    const cam = await repos.createCamera(a.tenantId, {
      name: "Own",
      feedType: "static_url",
      feedUrl: "https://e.com/o.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie: a.cookie },
      payload: { cameraIds: [cam.id] },
    });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: a.cookie } });
    expect(list.json().groups.find((g: { id: string }) => g.id === gid).cameraIds).toEqual([cam.id]);
  });

  it("rejects group membership with a camera from another tenant and writes nothing", async () => {
    const { app, repos } = makeApp();
    const a = await registerTenant(app, "A", "foreigncam-a", "a@foreigncam.dev");
    const b = await registerTenant(app, "B", "foreigncam-b", "b@foreigncam.dev");
    const own = await repos.createCamera(a.tenantId, {
      name: "Own",
      feedType: "static_url",
      feedUrl: "https://e.com/o.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const foreign = await repos.createCamera(b.tenantId, {
      name: "Foreign",
      feedType: "static_url",
      feedUrl: "https://e.com/f.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/groups",
      headers: { cookie: a.cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    const gid = created.json().group.id as string;
    const seed = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie: a.cookie },
      payload: { cameraIds: [own.id] },
    });
    expect(seed.statusCode).toBe(204);

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/groups/${gid}/cameras`,
      headers: { cookie: a.cookie },
      payload: { cameraIds: [own.id, foreign.id] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toBe("cameraIds must reference your own cameras");

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie: a.cookie } });
    expect(list.json().groups.find((g: { id: string }) => g.id === gid).cameraIds).toEqual([own.id]);
  });
});
