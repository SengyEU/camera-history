import { describe, expect, it } from "vitest";
import { createFakeRepos } from "@ch/db";
import { purgeExpiredImages } from "../src/retention.js";

describe("retention purge", () => {
  it("deletes rows first and logs orphan objects when storage removal fails", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    for (const [index, key] of ["old-1", "old-2", "old-3"].entries()) {
      await repos.insertImage({
        cameraId: camera.id,
        timestamp: new Date(`2024-0${index + 1}-01T00:00:00Z`),
        storageKey: key,
        sizeBytes: 100,
      });
    }
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: new Date("2026-09-01T00:00:00Z"),
      storageKey: "new-1",
      sizeBytes: 100,
    });

    const removed: string[] = [];
    const logs: string[] = [];
    const count = await purgeExpiredImages({
      repos,
      storage: {
        remove: async (key: string) => {
          if (key === "old-2") throw new Error("minio down");
          removed.push(key);
        },
      },
      now: new Date("2026-11-19T00:00:00Z"),
      batchSize: 2,
      log: (message) => logs.push(message),
    });

    expect(count).toBe(3);
    expect(removed.sort()).toEqual(["old-1", "old-3"]);
    expect(logs.some((line) => line.includes("orphan object old-2"))).toBe(true);
    expect(repos.db.images.map((image) => image.storageKey)).toEqual(["new-1"]);
  });
});
