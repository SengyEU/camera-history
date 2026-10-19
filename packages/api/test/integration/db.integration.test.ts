import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { cameraGroupMembers, cameras, createDb, createRepos, tenants, users } from "@ch/db";
import { loadConfig } from "@ch/core";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!RUN)("PG integration", () => {
  it("creates tenant, camera, image and queries within day", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "IT", slug: `it-${Date.now()}` });
    const user = await repos.createUser({
      tenantId: tenant.id,
      email: `it-${tenant.id}@test.dev`,
      passwordHash: "x",
    });
    const cam = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const img = await repos.insertImage({
      cameraId: cam.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: "org/it/cam/2026-09-18/090000.jpg",
      sizeBytes: 3,
    });
    const rows = await repos.imagesForCameraDay(
      cam.id,
      new Date("2026-09-18T00:00:00Z"),
      new Date("2026-09-19T00:00:00Z"),
    );
    expect(rows.map((r) => r.id)).toContain(img.id);
    expect(user.email).toContain("@test.dev");

    await db.delete(cameras).where(eq(cameras.id, cam.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });

  it("roundtrips camera coordinates and daylightOnly through create, read, update and public camera", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "COORD", slug: `coord-${Date.now()}` });
    const withCoords = await repos.createCamera(tenant.id, {
      name: "Geo", feedType: "static_url", feedUrl: "https://e.com/geo.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "America/Edmonton",
      latitude: 51.425, longitude: -116.177, daylightOnly: true,
    });
    expect(withCoords.latitude).toBeCloseTo(51.425);
    expect(withCoords.longitude).toBeCloseTo(-116.177);
    expect(withCoords.daylightOnly).toBe(true);

    const fetched = await repos.getCameraById(withCoords.id);
    expect(fetched?.latitude).toBeCloseTo(51.425);
    expect(fetched?.longitude).toBeCloseTo(-116.177);
    expect(fetched?.daylightOnly).toBe(true);

    const pub = await repos.getPublicCamera(withCoords.id);
    expect(pub?.latitude).toBeCloseTo(51.425);
    expect(pub?.longitude).toBeCloseTo(-116.177);
    expect(pub?.timezone).toBe("America/Edmonton");

    const plain = await repos.createCamera(tenant.id, {
      name: "Plain", feedType: "static_url", feedUrl: "https://e.com/plain.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    expect(plain.latitude).toBeNull();
    expect(plain.longitude).toBeNull();
    expect(plain.daylightOnly).toBe(false);

    const updated = await repos.updateCamera(plain.id, { latitude: 50.08, longitude: 14.42, daylightOnly: true });
    expect(updated?.latitude).toBeCloseTo(50.08);
    expect(updated?.longitude).toBeCloseTo(14.42);
    expect(updated?.daylightOnly).toBe(true);

    const cleared = await repos.updateCamera(plain.id, { latitude: null, longitude: null, daylightOnly: false });
    expect(cleared?.latitude).toBeNull();
    expect(cleared?.longitude).toBeNull();
    expect(cleared?.daylightOnly).toBe(false);

    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });

  it("roundtrips showNight through create, read, update and public camera", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "NIGHT", slug: `night-${Date.now()}` });
    const night = await repos.createCamera(tenant.id, {
      name: "Night", feedType: "static_url", feedUrl: "https://e.com/n.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
      showNight: true, planMonths: 3,
    });
    expect(night.showNight).toBe(true);

    const fetched = await repos.getCameraById(night.id);
    expect(fetched?.showNight).toBe(true);

    const pub = await repos.getPublicCamera(night.id);
    expect(pub?.showNight).toBe(true);
    expect(pub?.timezone).toBe("UTC");

    const plain = await repos.createCamera(tenant.id, {
      name: "Plain", feedType: "static_url", feedUrl: "https://e.com/p.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    expect(plain.showNight).toBe(false);

    const updated = await repos.updateCamera(plain.id, { showNight: true });
    expect(updated?.showNight).toBe(true);

    const reverted = await repos.updateCamera(plain.id, { showNight: false });
    expect(reverted?.showNight).toBe(false);

    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });

  it("creates groups, sets membership idempotently, resolves public group by slug", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "GRP", slug: `grp-${Date.now()}` });
    const a = await repos.createCamera(tenant.id, {
      name: "Alpha", feedType: "static_url", feedUrl: "https://e.com/a.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
      showNight: true, planMonths: 3,
    });
    const b = await repos.createCamera(tenant.id, {
      name: "Beta", feedType: "static_url", feedUrl: "https://e.com/b.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC", enabled: false,
    });
    const g = await repos.createGroup(tenant.id, { name: "Summit", slug: "summit" });
    await repos.setGroupCameras(g.id, [a.id, b.id]);
    await repos.setGroupCameras(g.id, [a.id]); // idempotent replace → only Alpha remains

    const list = await repos.listGroups(tenant.id);
    expect(list.find((x) => x.id === g.id)?.cameraIds).toEqual([a.id]);

    const pub = await repos.getGroupBySlug(tenant.slug, "summit");
    expect(pub?.group.slug).toBe("summit");
    expect(pub?.cameras.map((c) => c.id)).toEqual([a.id]); // disabled Beta excluded
    expect(pub?.cameras[0]?.showNight).toBe(true); // per-camera showNight reaches the group DTO
    expect(pub?.cameras[0]?.timezone).toBe("UTC"); // camera timezone reaches the group DTO
    expect(pub?.cameras[0]?.retentionMonths).toBe(3); // per-camera plan reaches the group DTO
    expect(await repos.getGroupBySlug(tenant.slug, "nope")).toBeNull();

    const noop = await repos.updateGroup(g.id, {});
    expect(noop).not.toBeNull();
    expect(noop?.name).toBe("Summit");

    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });

  it("orders public group cameras by configured position", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "ORD", slug: `ord-${Date.now()}` });
    const zulu = await repos.createCamera(tenant.id, {
      name: "Zulu", feedType: "static_url", feedUrl: "https://e.com/z.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const alpha = await repos.createCamera(tenant.id, {
      name: "Alpha", feedType: "static_url", feedUrl: "https://e.com/a.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const g = await repos.createGroup(tenant.id, { name: "Order", slug: "order" });
    await repos.setGroupCameras(g.id, [zulu.id, alpha.id]);

    const pub = await repos.getGroupBySlug(tenant.slug, "order");
    expect(pub?.cameras.map((c) => c.name)).toEqual(["Zulu", "Alpha"]);
    expect((await repos.listGroups(tenant.id))[0]?.cameraIds).toEqual([zulu.id, alpha.id]);

    await repos.setGroupCameras(g.id, [alpha.id, zulu.id]);
    expect((await repos.getGroupBySlug(tenant.slug, "order"))?.cameras.map((c) => c.name)).toEqual([
      "Alpha",
      "Zulu",
    ]);

    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });

  it("enforces unique (tenant, slug) groups and allows the same slug for another tenant", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const stamp = Date.now();
    const t1 = await repos.createTenant({ name: "UNIQ1", slug: `uniq1-${stamp}` });
    const t2 = await repos.createTenant({ name: "UNIQ2", slug: `uniq2-${stamp}` });
    await repos.createGroup(t1.id, { name: "Summit", slug: "summit" });

    await expect(repos.createGroup(t1.id, { name: "Dup", slug: "summit" })).rejects.toThrow();

    const other = await repos.createGroup(t2.id, { name: "Summit", slug: "summit" });
    expect(other.tenantId).toBe(t2.id);
    expect((await repos.getGroupBySlug(t2.slug, "summit"))?.group.id).toBe(other.id);

    await db.delete(tenants).where(eq(tenants.id, t1.id));
    await db.delete(tenants).where(eq(tenants.id, t2.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });

  it("cascades camera and group deletes across membership and keeps tenants isolated", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const stamp = Date.now();
    const t1 = await repos.createTenant({ name: "CASC1", slug: `casc1-${stamp}` });
    const t2 = await repos.createTenant({ name: "CASC2", slug: `casc2-${stamp}` });
    const cam1 = await repos.createCamera(t1.id, {
      name: "C1", feedType: "static_url", feedUrl: "https://e.com/c1.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const cam2 = await repos.createCamera(t1.id, {
      name: "C2", feedType: "static_url", feedUrl: "https://e.com/c2.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const otherCam = await repos.createCamera(t2.id, {
      name: "Other", feedType: "static_url", feedUrl: "https://e.com/o.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const g1 = await repos.createGroup(t1.id, { name: "One", slug: "one" });
    const g2 = await repos.createGroup(t2.id, { name: "Two", slug: "two" });
    await repos.setGroupCameras(g1.id, [cam1.id, cam2.id]);
    await repos.setGroupCameras(g2.id, [otherCam.id]);

    await repos.deleteCamera(cam1.id);
    expect((await repos.getGroupBySlug(t1.slug, "one"))?.cameras.map((c) => c.id)).toEqual([cam2.id]);
    expect((await repos.getGroupBySlug(t2.slug, "two"))?.cameras.map((c) => c.id)).toEqual([otherCam.id]);

    await repos.deleteGroup(g1.id);
    expect(await repos.getGroupBySlug(t1.slug, "one")).toBeNull();
    const members = await db
      .select()
      .from(cameraGroupMembers)
      .where(eq(cameraGroupMembers.cameraGroupId, g1.id));
    expect(members).toHaveLength(0);
    const otherMembers = await db
      .select()
      .from(cameraGroupMembers)
      .where(eq(cameraGroupMembers.cameraGroupId, g2.id));
    expect(otherMembers.map((m) => m.cameraId)).toEqual([otherCam.id]);

    await db.delete(tenants).where(eq(tenants.id, t1.id));
    await db.delete(tenants).where(eq(tenants.id, t2.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });
});
