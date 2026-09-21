import { randomUUID } from "node:crypto";
import type {
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  Tenant,
  User,
} from "@ch/core";
import type { Repos } from "../repos.types.js";

export interface FakeDb {
  tenants: Tenant[];
  users: User[];
  cameras: Camera[];
  images: ImageRecord[];
}

export function createFakeRepos(seed: Partial<FakeDb> = {}): Repos & { db: FakeDb } {
  const db: FakeDb = {
    tenants: seed.tenants ?? [],
    users: seed.users ?? [],
    cameras: seed.cameras ?? [],
    images: seed.images ?? [],
  };

  const repos: Repos = {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const tenant: Tenant = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        planMonths: input.planMonths ?? 12,
      };
      db.tenants.push(tenant);
      return tenant;
    },
    async getTenantById(id: string) {
      return db.tenants.find((t) => t.id === id) ?? null;
    },
    async getTenantBySlug(slug: string) {
      return db.tenants.find((t) => t.slug === slug) ?? null;
    },
    async createUser(input: NewUser): Promise<User> {
      const user: User = {
        id: randomUUID(),
        tenantId: input.tenantId,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role ?? "owner",
      };
      db.users.push(user);
      return user;
    },
    async getUserByEmail(email: string) {
      return db.users.find((u) => u.email === email) ?? null;
    },
    async createCamera(tenantId: string, input: NewCamera): Promise<Camera> {
      const camera: Camera = {
        id: randomUUID(),
        tenantId,
        name: input.name,
        feedType: input.feedType,
        feedUrl: input.feedUrl,
        feedConfig: input.feedConfig ?? {},
        intervalMinutes: input.intervalMinutes,
        activeFrom: input.activeFrom,
        activeTo: input.activeTo,
        timezone: input.timezone,
        enabled: input.enabled ?? true,
        theme: "light",
        lastCaptureAt: null,
        lastError: null,
      };
      db.cameras.push(camera);
      return camera;
    },
    async getCameraById(id: string) {
      return db.cameras.find((c) => c.id === id) ?? null;
    },
    async listCameras(tenantId: string) {
      return db.cameras.filter((c) => c.tenantId === tenantId);
    },
    async updateCamera(id: string, patch: CameraPatch) {
      const idx = db.cameras.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      const updated: Camera = { ...db.cameras[idx]!, ...patch, id };
      db.cameras[idx] = updated;
      return updated;
    },
    async deleteCamera(id: string) {
      db.cameras = db.cameras.filter((c) => c.id !== id);
      db.images = db.images.filter((i) => i.cameraId !== id);
    },
    async listEnabledCameras() {
      return db.cameras.filter((c) => c.enabled);
    },
    async getPublicCamera(cameraId: string): Promise<PublicCamera | null> {
      const cam = db.cameras.find((c) => c.id === cameraId);
      if (!cam) return null;
      const tenant = db.tenants.find((t) => t.id === cam.tenantId);
      return {
        id: cam.id,
        name: cam.name,
        theme: cam.theme,
        retentionMonths: tenant?.planMonths ?? 12,
      };
    },
    async insertImage(input: NewImage): Promise<ImageRecord> {
      const rec: ImageRecord = {
        id: randomUUID(),
        cameraId: input.cameraId,
        timestamp: input.timestamp,
        storageKey: input.storageKey,
        sizeBytes: input.sizeBytes,
      };
      db.images.push(rec);
      return rec;
    },
    async imagesForCameraDay(cameraId: string, from: Date, to: Date) {
      return db.images
        .filter((i) => i.cameraId === cameraId)
        .filter((i) => {
          const ts = i.timestamp.getTime();
          return ts >= from.getTime() && ts < to.getTime();
        })
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
    async getImageById(id: string) {
      return db.images.find((i) => i.id === id) ?? null;
    },
    async latestImageForCamera(cameraId: string) {
      return (
        db.images
          .filter((i) => i.cameraId === cameraId)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0] ?? null
      );
    },
  };

  return { ...repos, db };
}