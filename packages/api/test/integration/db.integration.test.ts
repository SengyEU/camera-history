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
});