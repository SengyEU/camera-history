import { randomUUID } from "node:crypto";
import type {
  AdminCameraGroup,
  BillingPatch,
  BillingStatus,
  Camera,
  CameraGroup,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewCameraGroup,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  PublicGroupWithCameras,
  Tenant,
  User,
} from "@ch/core";
import type { Repos } from "../repos.types.js";

export interface FakeDb {
  tenants: Tenant[];
  users: User[];
  cameras: Camera[];
  images: ImageRecord[];
  cameraGroups: CameraGroup[];
  cameraGroupMembers: { cameraGroupId: string; cameraId: string }[];
}

export function createFakeRepos(seed: Partial<FakeDb> = {}): Repos & { db: FakeDb } {
  const db: FakeDb = {
    tenants: seed.tenants ?? [],
    users: seed.users ?? [],
    cameras: seed.cameras ?? [],
    images: seed.images ?? [],
    cameraGroups: seed.cameraGroups ?? [],
    cameraGroupMembers: seed.cameraGroupMembers ?? [],
  };

  const repos: Repos = {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const tenant: Tenant = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        planMonths: input.planMonths ?? 12,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingStatus: "none",
        billingGraceUntil: null,
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
        theme: input.theme ?? "light",
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        daylightOnly: input.daylightOnly ?? false,
        showNight: input.showNight ?? false,
        lastCaptureAt: null,
        lastError: null,
        status: "operational",
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
        latitude: cam.latitude,
        longitude: cam.longitude,
        showNight: cam.showNight,
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
    async countCameras(tenantId: string) {
      return db.cameras.filter((c) => c.tenantId === tenantId).length;
    },
    async usageStats(tenantId: string) {
      const cameraIds = new Set(db.cameras.filter((c) => c.tenantId === tenantId).map((c) => c.id));
      const owned = db.images.filter((i) => cameraIds.has(i.cameraId));
      if (owned.length === 0) return { usageBytes: 0, spanDays: 0 };
      const usageBytes = owned.reduce((sum, i) => sum + i.sizeBytes, 0);
      const times = owned.map((i) => i.timestamp.getTime());
      const spanDays = Math.max(1, Math.ceil((Math.max(...times) - Math.min(...times)) / 86_400_000));
      return { usageBytes, spanDays };
    },
    async setTenantCamerasEnabled(tenantId: string, enabled: boolean) {
      for (let i = 0; i < db.cameras.length; i += 1) {
        if (db.cameras[i]!.tenantId === tenantId) db.cameras[i] = { ...db.cameras[i]!, enabled };
      }
    },
    async setBillingState(tenantId: string, patch: BillingPatch) {
      const idx = db.tenants.findIndex((t) => t.id === tenantId);
      if (idx === -1) return null;
      const updated: Tenant = { ...db.tenants[idx]!, ...patch, id: tenantId };
      db.tenants[idx] = updated;
      return updated;
    },
    async listTenantsByBillingStatus(status: BillingStatus) {
      return db.tenants.filter((t) => t.billingStatus === status);
    },
    async createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup> {
      const group: CameraGroup = { id: randomUUID(), tenantId, name: input.name, slug: input.slug };
      db.cameraGroups.push(group);
      return group;
    },
    async listGroups(tenantId: string): Promise<AdminCameraGroup[]> {
      return db.cameraGroups
        .filter((g) => g.tenantId === tenantId)
        .map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          cameraIds: db.cameraGroupMembers.filter((m) => m.cameraGroupId === g.id).map((m) => m.cameraId),
        }));
    },
    async getGroup(id: string) {
      return db.cameraGroups.find((g) => g.id === id) ?? null;
    },
    async updateGroup(id: string, patch: { name?: string; slug?: string }) {
      const idx = db.cameraGroups.findIndex((g) => g.id === id);
      if (idx === -1) return null;
      const updated: CameraGroup = { ...db.cameraGroups[idx]!, ...patch, id };
      db.cameraGroups[idx] = updated;
      return updated;
    },
    async deleteGroup(id: string) {
      db.cameraGroups = db.cameraGroups.filter((g) => g.id !== id);
      db.cameraGroupMembers = db.cameraGroupMembers.filter((m) => m.cameraGroupId !== id);
    },
    async setGroupCameras(groupId: string, cameraIds: string[]) {
      db.cameraGroupMembers = db.cameraGroupMembers.filter((m) => m.cameraGroupId !== groupId);
      for (const cameraId of cameraIds) db.cameraGroupMembers.push({ cameraGroupId: groupId, cameraId });
    },
    async getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null> {
      const tenant = db.tenants.find((t) => t.slug === tenantSlug);
      if (!tenant) return null;
      const group = db.cameraGroups.find((g) => g.tenantId === tenant.id && g.slug === groupSlug);
      if (!group) return null;
      const cams = db.cameraGroupMembers
        .filter((m) => m.cameraGroupId === group.id)
        .map((m) => db.cameras.find((c) => c.id === m.cameraId))
        .filter((c): c is Camera => !!c && c.enabled)
        .map((c) => ({ id: c.id, name: c.name, theme: c.theme, showNight: c.showNight }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { group: { id: group.id, name: group.name, slug: group.slug }, cameras: cams };
    },
  };

  return { ...repos, db };
}