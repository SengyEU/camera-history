import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { keyFor } from "@ch/db";
import { captureBuffer } from "./adapters/index.js";
import { isCaptureDue } from "./schedule.js";

export interface RunScheduleDeps {
  repos: Repos;
  storage: ObjectStorage;
  cfg: AppConfig;
  now?: Date;
  log?: (msg: string) => void;
}

export async function runSchedule(deps: RunScheduleDeps): Promise<number> {
  const { repos, storage, cfg, log = () => {} } = deps;
  const now = deps.now ?? new Date();
  const cameras = await repos.listEnabledCameras();
  const due = cameras.filter((cam) => isCaptureDue(cam, now));
  let processed = 0;

  for (let i = 0; i < due.length; i += cfg.worker.concurrency) {
    const batch = due.slice(i, i + cfg.worker.concurrency);
    await Promise.all(
      batch.map(async (cam) => {
        processed += 1;
        try {
          const jpeg = await captureBuffer(cam, cfg);
          const tenant = await repos.getTenantById(cam.tenantId);
          if (!tenant) throw new Error(`tenant ${cam.tenantId} not found`);
          const key = keyFor(tenant.slug, cam.id, now);
          await storage.put(key, jpeg);
          await repos.insertImage({
            cameraId: cam.id,
            timestamp: now,
            storageKey: key,
            sizeBytes: jpeg.length,
          });
          await repos.updateCamera(cam.id, { lastCaptureAt: now, lastError: null });
          log(`captured ${cam.id} ${key}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await repos.updateCamera(cam.id, { lastError: message });
          log(`capture failed ${cam.id}: ${message}`);
        }
      }),
    );
  }
  return processed;
}