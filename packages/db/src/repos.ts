import { and, desc, eq, gte, lt } from "drizzle-orm";
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
import type { Db } from "./db.js";
import { cameras, images, tenants, users } from "./schema.js";
import type { Repos } from "./repos.types.js";

export function createRepos(db: Db): Repos {
  return {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const [row] = await db
        .insert(tenants)
        .values({ name: input.name, slug: input.slug, planMonths: input.planMonths ?? 12 })
        .returning();
      return row!;
    },
    async getTenantById(id: string) {
      const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
      return row ?? null;
    },
    async getTenantBySlug(slug: string) {
      const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug));
      return row ?? null;
    },
    async createUser(input: NewUser): Promise<User> {
      const [row] = await db
        .insert(users)
        .values({
          tenantId: input.tenantId,
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role ?? "owner",
        })
        .returning();
      return row!;
    },
    async getUserByEmail(email: string) {
      const [row] = await db.select().from(users).where(eq(users.email, email));
      return row ?? null;
    },
    async createCamera(tenantId: string, input: NewCamera): Promise<Camera> {
      const [row] = await db
        .insert(cameras)
        .values({
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
        })
        .returning();
      return row!;
    },
    async getCameraById(id: string) {
      const [row] = await db.select().from(cameras).where(eq(cameras.id, id));
      return row ?? null;
    },
    async listCameras(tenantId: string) {
      return db.select().from(cameras).where(eq(cameras.tenantId, tenantId));
    },
    async updateCamera(id: string, patch: CameraPatch) {
      const [row] = await db.update(cameras).set(patch).where(eq(cameras.id, id)).returning();
      return row ?? null;
    },
    async deleteCamera(id: string) {
      await db.delete(cameras).where(eq(cameras.id, id));
    },
    async listEnabledCameras() {
      return db.select().from(cameras).where(eq(cameras.enabled, true));
    },
    async getPublicCamera(cameraId: string): Promise<PublicCamera | null> {
      const rows = await db
        .select({
          id: cameras.id,
          name: cameras.name,
          theme: cameras.theme,
          retentionMonths: tenants.planMonths,
        })
        .from(cameras)
        .innerJoin(tenants, eq(cameras.tenantId, tenants.id))
        .where(eq(cameras.id, cameraId));
      const row = rows[0];
      return row ? { ...row, retentionMonths: row.retentionMonths ?? 12 } : null;
    },
    async insertImage(input: NewImage): Promise<ImageRecord> {
      const [row] = await db.insert(images).values(input).returning();
      return row!;
    },
    async imagesForCameraDay(cameraId: string, from: Date, to: Date) {
      return db
        .select()
        .from(images)
        .where(and(eq(images.cameraId, cameraId), gte(images.timestamp, from), lt(images.timestamp, to)))
        .orderBy(images.timestamp);
    },
    async getImageById(id: string) {
      const [row] = await db.select().from(images).where(eq(images.id, id));
      return row ?? null;
    },
    async latestImageForCamera(cameraId: string) {
      const [row] = await db
        .select()
        .from(images)
        .where(eq(images.cameraId, cameraId))
        .orderBy(desc(images.timestamp))
        .limit(1);
      return row ?? null;
    },
  };
}