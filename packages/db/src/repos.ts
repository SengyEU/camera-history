import { and, desc, eq, gt, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
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
import { DEFAULT_PACKAGE, RETENTION_MONTHS, isTenantBillable, slugify } from "@ch/core";
import type { Db } from "./db.js";
import { cameraGroupMembers, cameraGroups, cameras, emailVerificationTokens, images, tenants, users } from "./schema.js";
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
  return { ...row, packageCode: row.packageCode as Tenant["packageCode"] };
}

function toCamera(row: CameraRow): Camera {
  return {
    ...row,
    timeFormat: row.timeFormat as "12h" | "24h",
  };
}

function tenantValues(input: NewTenant) {
  return {
    name: input.name,
    slug: input.slug,
    packageCode: input.packageCode ?? DEFAULT_PACKAGE,
    billingStatus: input.billingStatus ?? "none",
    billingGraceUntil: input.billingGraceUntil ?? null,
    isPilot: input.isPilot ?? false,
    pilotUntil: input.pilotUntil ?? null,
  };
}

function cameraValues(tenantId: string, input: NewCamera) {
  return {
    tenantId,
    name: input.name,
    slug: input.slug ?? slugify(input.name),
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
    timeFormat: input.timeFormat ?? "12h",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    daylightOnly: input.daylightOnly ?? false,
    showNight: input.showNight ?? false,
  };
}

export function createRepos(db: Db): Repos {
  return {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const [row] = await db.insert(tenants).values(tenantValues(input)).returning();
      return toTenant(row!);
    },
    async createTenantWithUser({ tenant, user }) {
      return db.transaction(async (tx) => {
        const [tenantRow] = await tx.insert(tenants).values(tenantValues(tenant)).returning();
        const [userRow] = await tx
          .insert(users)
          .values({
            tenantId: tenantRow!.id,
            email: user.email,
            passwordHash: user.passwordHash,
            role: user.role ?? "owner",
          })
          .returning();
        return { tenant: toTenant(tenantRow!), user: userRow! };
      });
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
    async getUserById(id: string) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row ?? null;
    },
    async updateUserPassword(id, passwordHash) {
      await db.update(users).set({ passwordHash }).where(eq(users.id, id));
    },
    async markEmailVerified(id, at) {
      const [row] = await db
        .update(users)
        .set({ emailVerifiedAt: at })
        .where(eq(users.id, id))
        .returning();
      return row ?? null;
    },
    async markWelcomeSent(id, at) {
      await db.update(users).set({ welcomeSentAt: at }).where(eq(users.id, id));
    },
    async deleteEmailVerificationTokensForUser(userId) {
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    },
    async createEmailVerificationToken({ userId, tokenHash, expiresAt }) {
      await db.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });
    },
    async consumeEmailVerificationToken(tokenHash, now) {
      return db.transaction(async (tx) => {
        const [token] = await tx
          .select()
          .from(emailVerificationTokens)
          .where(
            and(
              eq(emailVerificationTokens.tokenHash, tokenHash),
              isNull(emailVerificationTokens.usedAt),
              gt(emailVerificationTokens.expiresAt, now),
            ),
          )
          .for("update");
        if (!token) return null;
        await tx
          .update(emailVerificationTokens)
          .set({ usedAt: now })
          .where(eq(emailVerificationTokens.id, token.id));
        return { userId: token.userId };
      });
    },
    async createCamera(tenantId: string, input: NewCamera): Promise<Camera> {
      const [row] = await db.insert(cameras).values(cameraValues(tenantId, input)).returning();
      return toCamera(row!);
    },
    async createCameraWithLimit(tenantId, input, limit) {
      return db.transaction(async (tx) => {
        const [tenant] = await tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .for("update");
        if (!tenant) throw new Error("tenant not found");
        const rows = await tx
          .select({ id: cameras.id })
          .from(cameras)
          .where(eq(cameras.tenantId, tenantId));
        if (rows.length >= limit) return { camera: null, cameraCount: rows.length };
        const [row] = await tx.insert(cameras).values(cameraValues(tenantId, input)).returning();
        return { camera: toCamera(row!) };
      });
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
      const [row] = await db.update(cameras).set(patch).where(eq(cameras.id, id)).returning();
      return row ? toCamera(row) : null;
    },
    async deleteCamera(id: string) {
      await db.delete(cameras).where(eq(cameras.id, id));
    },
    async listEnabledCameras(now: Date) {
      const rows = await db
        .select({ camera: cameras, tenant: tenants })
        .from(cameras)
        .innerJoin(tenants, eq(cameras.tenantId, tenants.id))
        .where(eq(cameras.enabled, true));
      return rows
        .filter((row) => isTenantBillable(row.tenant, now))
        .map((row) => toCamera(row.camera));
    },
    async getPublicCamera(cameraId: string): Promise<PublicCamera | null> {
      const rows = await db
        .select({
          id: cameras.id,
          name: cameras.name,
          slug: cameras.slug,
          theme: cameras.theme,
          themeColors: cameras.themeColors,
          timezone: cameras.timezone,
          timeFormat: cameras.timeFormat,
          latitude: cameras.latitude,
          longitude: cameras.longitude,
          showNight: cameras.showNight,
        })
        .from(cameras)
        .innerJoin(tenants, eq(cameras.tenantId, tenants.id))
        .where(
          and(
            eq(cameras.id, cameraId),
            eq(cameras.enabled, true),
            notInArray(tenants.billingStatus, ["unpaid", "canceled"]),
          ),
        );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            name: row.name,
            slug: row.slug,
            theme: row.theme,
            themeColors: row.themeColors ?? null,
            timezone: row.timezone,
            timeFormat: row.timeFormat as "12h" | "24h",
            retentionMonths: RETENTION_MONTHS,
            latitude: row.latitude,
            longitude: row.longitude,
            showNight: row.showNight,
          }
        : null;
    },
    async getPublicCameraBySlug(
      tenantSlug: string,
      cameraSlug: string,
    ): Promise<PublicCamera | null> {
      const rows = await db
        .select({
          id: cameras.id,
          name: cameras.name,
          slug: cameras.slug,
          theme: cameras.theme,
          themeColors: cameras.themeColors,
          timezone: cameras.timezone,
          timeFormat: cameras.timeFormat,
          latitude: cameras.latitude,
          longitude: cameras.longitude,
          showNight: cameras.showNight,
        })
        .from(cameras)
        .innerJoin(tenants, eq(cameras.tenantId, tenants.id))
        .where(
          and(
            eq(tenants.slug, tenantSlug),
            eq(cameras.slug, cameraSlug),
            eq(cameras.enabled, true),
            notInArray(tenants.billingStatus, ["unpaid", "canceled"]),
          ),
        );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            name: row.name,
            slug: row.slug,
            theme: row.theme,
            themeColors: row.themeColors ?? null,
            timezone: row.timezone,
            timeFormat: row.timeFormat as "12h" | "24h",
            retentionMonths: RETENTION_MONTHS,
            latitude: row.latitude,
            longitude: row.longitude,
            showNight: row.showNight,
          }
        : null;
    },
    async listPublicCamerasByTenantSlug(tenantSlug: string) {
      const tenant = await this.getTenantBySlug(tenantSlug);
      if (!tenant || ["unpaid", "canceled"].includes(tenant.billingStatus)) return null;
      return db
        .select({ id: cameras.id, name: cameras.name, slug: cameras.slug })
        .from(cameras)
        .where(and(eq(cameras.tenantId, tenant.id), eq(cameras.enabled, true)))
        .orderBy(cameras.name);
    },
    async listPublicGroupsByTenantSlug(tenantSlug: string) {
      const tenant = await this.getTenantBySlug(tenantSlug);
      if (!tenant || ["unpaid", "canceled"].includes(tenant.billingStatus)) return null;
      const rows = await db
        .select({
          id: cameraGroups.id,
          name: cameraGroups.name,
          slug: cameraGroups.slug,
          cameraId: cameras.id,
        })
        .from(cameraGroups)
        .innerJoin(tenants, eq(cameraGroups.tenantId, tenants.id))
        .leftJoin(cameraGroupMembers, eq(cameraGroupMembers.cameraGroupId, cameraGroups.id))
        .leftJoin(
          cameras,
          and(eq(cameras.id, cameraGroupMembers.cameraId), eq(cameras.enabled, true)),
        )
        .where(and(eq(tenants.slug, tenantSlug), notInArray(tenants.billingStatus, ["unpaid", "canceled"])))
        .orderBy(cameraGroups.name);
      const groups = new Map<string, { id: string; name: string; slug: string; cameraCount: number }>();
      for (const row of rows) {
        const group = groups.get(row.id) ?? {
          id: row.id,
          name: row.name,
          slug: row.slug,
          cameraCount: 0,
        };
        if (row.cameraId) group.cameraCount += 1;
        groups.set(row.id, group);
      }
      return [...groups.values()].filter((group) => group.cameraCount > 0);
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
    async listImagesBefore(cutoff: Date, limit: number) {
      return db
        .select({ id: images.id, storageKey: images.storageKey })
        .from(images)
        .where(lt(images.timestamp, cutoff))
        .orderBy(images.timestamp)
        .limit(limit);
    },
    async deleteImages(ids: string[]) {
      if (ids.length === 0) return;
      await db.delete(images).where(inArray(images.id, ids));
    },
    async listImagesForCamera(cameraId: string) {
      return db
        .select({ id: images.id, storageKey: images.storageKey })
        .from(images)
        .where(eq(images.cameraId, cameraId));
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
          packageCode: patch.packageCode,
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
          cposition: cameraGroupMembers.position,
        })
        .from(cameraGroups)
        .innerJoin(tenants, eq(tenants.id, cameraGroups.tenantId))
        .leftJoin(cameraGroupMembers, eq(cameraGroupMembers.cameraGroupId, cameraGroups.id))
        .leftJoin(cameras, eq(cameras.id, cameraGroupMembers.cameraId))
        .where(
          and(
            eq(tenants.slug, tenantSlug),
            eq(cameraGroups.slug, groupSlug),
            notInArray(tenants.billingStatus, ["unpaid", "canceled"]),
          ),
        );
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
          retentionMonths: RETENTION_MONTHS,
          showNight: r.cshowNight!,
        }));
      return { group, cameras: cams };
    },
  };
}