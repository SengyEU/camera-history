import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { cameras, createDb, createRepos, tenants, users } from "@ch/db";
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

  it("creates groups, sets membership idempotently, resolves public group by slug", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "GRP", slug: `grp-${Date.now()}` });
    const a = await repos.createCamera(tenant.id, {
      name: "Alpha", feedType: "static_url", feedUrl: "https://e.com/a.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
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
    expect(await repos.getGroupBySlug(tenant.slug, "nope")).toBeNull();

    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = db.$client as import("pg").Pool;
    await pool.end();
  });
});