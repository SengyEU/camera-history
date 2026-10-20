import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
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
import type { Db } from "./db.js";
import { cameraGroupMembers, cameraGroups, cameras, images, tenants, users } from "./schema.js";
import type { Repos } from "./repos.types.js";

type TenantRow = typeof tenants.$inferSelect;
type CameraRow = typeof cameras.$inferSelect;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toTenant(row: TenantRow): Tenant {
  return { ...row, planMonths: Number(row.planMonths) };
}

function toCamera(row: CameraRow): Camera {
  return {
    ...row,
    planMonths: row.planMonths === null ? null : Number(row.planMonths),
    timeFormat: row.timeFormat as "12h" | "24h",
  };
}

export function createRepos(db: Db): Repos {
  return {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const [row] = await db
        .insert(tenants)
        .values({ name: input.name, slug: input.slug, planMonths: String(input.planMonths ?? 12) })
        .returning();
      return toTenant(row!);
    },
    async getTenantById(id: string) {
      const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
      return row ? toTenant(row) : null;
    },
    async getTenantBySlug(slug: string) {
      const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug));
      return row ? toTenant(row) : null;
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
          theme: input.theme ?? "light",
          themeColors: input.themeColors ?? null,
          planMonths: input.planMonths === null || input.planMonths === undefined ? null : String(input.planMonths),
          timeFormat: input.timeFormat ?? "12h",
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          daylightOnly: input.daylightOnly ?? false,
          showNight: input.showNight ?? false,
        })
        .returning();
      return toCamera(row!);
    },
    async getCameraById(id: string) {
      const [row] = await db.select().from(cameras).where(eq(cameras.id, id));
      return row ? toCamera(row) : null;
    },
    async listCameras(tenantId: string) {
      const rows = await db.select().from(cameras).where(eq(cameras.tenantId, tenantId));
      return rows.map(toCamera);
    },
    async updateCamera(id: string, patch: CameraPatch) {
      const { planMonths, ...rest } = patch;
      const values = {
        ...rest,
        ...(planMonths !== undefined
          ? { planMonths: planMonths === null ? null : String(planMonths) }
          : {}),
      };
      const [row] = await db.update(cameras).set(values).where(eq(cameras.id, id)).returning();
      return row ? toCamera(row) : null;
    },
    async deleteCamera(id: string) {
      await db.delete(cameras).where(eq(cameras.id, id));
    },
    async listEnabledCameras() {
      const rows = await db.select().from(cameras).where(eq(cameras.enabled, true));
      return rows.map(toCamera);
    },
    async getPublicCamera(cameraId: string): Promise<PublicCamera | null> {
      const rows = await db
        .select({
          id: cameras.id,
          name: cameras.name,
          theme: cameras.theme,
          themeColors: cameras.themeColors,
          timezone: cameras.timezone,
          timeFormat: cameras.timeFormat,
          cameraPlan: cameras.planMonths,
          tenantPlan: tenants.planMonths,
          latitude: cameras.latitude,
          longitude: cameras.longitude,
          showNight: cameras.showNight,
        })
        .from(cameras)
        .innerJoin(tenants, eq(cameras.tenantId, tenants.id))
        .where(eq(cameras.id, cameraId));
      const row = rows[0];
      return row
        ? {
            id: row.id,
            name: row.name,
            theme: row.theme,
            themeColors: row.themeColors ?? null,
            timezone: row.timezone,
            timeFormat: row.timeFormat as "12h" | "24h",
            retentionMonths: Number(row.cameraPlan ?? row.tenantPlan ?? 12),
            latitude: row.latitude,
            longitude: row.longitude,
            showNight: row.showNight,
          }
        : null;
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
    async countCameras(tenantId: string) {
      const rows = await db.select({ id: cameras.id }).from(cameras).where(eq(cameras.tenantId, tenantId));
      return rows.length;
    },
    async usageStats(tenantId: string) {
      const [row] = await db
        .select({
          bytes: sql<number>`COALESCE(SUM(${images.sizeBytes}), 0)`,
          first: sql<Date | null>`MIN(${images.timestamp})`,
          last: sql<Date | null>`MAX(${images.timestamp})`,
        })
        .from(images)
        .innerJoin(cameras, eq(images.cameraId, cameras.id))
        .where(eq(cameras.tenantId, tenantId));
      if (!row || Number(row.bytes) === 0) return { usageBytes: 0, spanDays: 0 };
      const first = toDate(row.first);
      const last = toDate(row.last);
      if (!first || !last) return { usageBytes: Number(row.bytes), spanDays: 0 };
      const spanDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86_400_000));
      return { usageBytes: Number(row.bytes), spanDays };
    },
    async cameraStats(tenantId: string) {
      const rows = await db
        .select({
          cameraId: images.cameraId,
          imageCount: sql<number>`COUNT(*)`,
          totalBytes: sql<number>`COALESCE(SUM(${images.sizeBytes}), 0)`,
          first: sql<Date | null>`MIN(${images.timestamp})`,
          last: sql<Date | null>`MAX(${images.timestamp})`,
        })
        .from(images)
        .innerJoin(cameras, eq(images.cameraId, cameras.id))
        .where(eq(cameras.tenantId, tenantId))
        .groupBy(images.cameraId);
      return new Map(
        rows.map((row) => [
          row.cameraId,
          {
            imageCount: Number(row.imageCount),
            totalBytes: Number(row.totalBytes),
            firstCaptureAt: toDate(row.first)?.toISOString() ?? null,
            lastCaptureAt: toDate(row.last)?.toISOString() ?? null,
          },
        ]),
      );
    },
    async setTenantCamerasEnabled(tenantId: string, enabled: boolean) {
      await db.update(cameras).set({ enabled }).where(eq(cameras.tenantId, tenantId));
    },
    async setBillingState(tenantId: string, patch: BillingPatch) {
      const [row] = await db
        .update(tenants)
        .set({
          stripeCustomerId: patch.stripeCustomerId,
          stripeSubscriptionId: patch.stripeSubscriptionId,
          billingStatus: patch.billingStatus,
          billingGraceUntil: patch.billingGraceUntil,
          planMonths: patch.planMonths !== undefined ? String(patch.planMonths) : undefined,
        })
        .where(eq(tenants.id, tenantId))
        .returning();
      return row ? toTenant(row) : null;
    },
    async listTenantsByBillingStatus(status: BillingStatus) {
      const rows = await db.select().from(tenants).where(eq(tenants.billingStatus, status));
      return rows.map(toTenant);
    },
    async createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup> {
      const [row] = await db
        .insert(cameraGroups)
        .values({ tenantId, name: input.name, slug: input.slug })
        .returning();
      return row!;
    },
    async listGroups(tenantId: string): Promise<AdminCameraGroup[]> {
      const groups = await db.select().from(cameraGroups).where(eq(cameraGroups.tenantId, tenantId));
      const members = await db
        .select({
          groupId: cameraGroupMembers.cameraGroupId,
          cameraId: cameraGroupMembers.cameraId,
          position: cameraGroupMembers.position,
        })
        .from(cameraGroupMembers)
        .innerJoin(cameraGroups, eq(cameraGroups.id, cameraGroupMembers.cameraGroupId))
        .where(eq(cameraGroups.tenantId, tenantId))
        .orderBy(cameraGroupMembers.position);
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        cameraIds: members
          .filter((m) => m.groupId === g.id)
          .sort((a, b) => a.position - b.position)
          .map((m) => m.cameraId),
      }));
    },
    async getGroup(id: string) {
      const [row] = await db.select().from(cameraGroups).where(eq(cameraGroups.id, id));
      return row ?? null;
    },
    async updateGroup(id: string, patch: { name?: string; slug?: string }) {
      if (Object.values(patch).every((v) => v === undefined)) return await this.getGroup(id);
      const [row] = await db.update(cameraGroups).set(patch).where(eq(cameraGroups.id, id)).returning();
      return row ?? null;
    },
    async deleteGroup(id: string) {
      await db.delete(cameraGroups).where(eq(cameraGroups.id, id));
    },
    async setGroupCameras(groupId: string, cameraIds: string[]) {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(cameraGroupMembers)
          .where(eq(cameraGroupMembers.cameraGroupId, groupId));
        const existingIds = new Set(existing.map((m) => m.cameraId));
        const want = new Set(cameraIds);
        const toDelete = [...existingIds].filter((id) => !want.has(id));
        if (toDelete.length > 0) {
          await tx
            .delete(cameraGroupMembers)
            .where(
              and(
                eq(cameraGroupMembers.cameraGroupId, groupId),
                inArray(cameraGroupMembers.cameraId, toDelete),
              ),
            );
        }
        for (const [position, cameraId] of cameraIds.entries()) {
          await tx
            .insert(cameraGroupMembers)
            .values({ cameraGroupId: groupId, cameraId, position })
            .onConflictDoUpdate({
              target: [cameraGroupMembers.cameraGroupId, cameraGroupMembers.cameraId],
              set: { position },
            });
        }
      });
    },
    async getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null> {
      const rows = await db
        .select({
          groupId: cameraGroups.id,
          gname: cameraGroups.name,
          gslug: cameraGroups.slug,
          cameraId: cameras.id,
          cname: cameras.name,
          ctheme: cameras.theme,
          cthemeColors: cameras.themeColors,
          ctimezone: cameras.timezone,
          ctimeFormat: cameras.timeFormat,
          cenabled: cameras.enabled,
          cshowNight: cameras.showNight,
          cplanMonths: cameras.planMonths,
          tplanMonths: tenants.planMonths,
          cposition: cameraGroupMembers.position,
        })
        .from(cameraGroups)
        .innerJoin(tenants, eq(tenants.id, cameraGroups.tenantId))
        .leftJoin(cameraGroupMembers, eq(cameraGroupMembers.cameraGroupId, cameraGroups.id))
        .leftJoin(cameras, eq(cameras.id, cameraGroupMembers.cameraId))
        .where(and(eq(tenants.slug, tenantSlug), eq(cameraGroups.slug, groupSlug)));
      if (rows.length === 0) return null;
      const group = { id: rows[0]!.groupId, name: rows[0]!.gname, slug: rows[0]!.gslug };
      const cams = rows
        .filter((r) => r.cameraId && r.cenabled)
        .sort((a, b) => (a.cposition ?? 0) - (b.cposition ?? 0) || a.cname!.localeCompare(b.cname!))
        .map((r) => ({
          id: r.cameraId!,
          name: r.cname!,
          theme: r.ctheme!,
          themeColors: r.cthemeColors ?? null,
          timezone: r.ctimezone!,
          timeFormat: r.ctimeFormat as "12h" | "24h",
          retentionMonths: Number(r.cplanMonths ?? r.tplanMonths ?? 12),
          showNight: r.cshowNight!,
        }));
      return { group, cameras: cams };
    },
  };
}