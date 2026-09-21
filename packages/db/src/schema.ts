import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  time,
  uniqueIndex,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

export const feedTypeEnum = pgEnum("feed_type", [
  "static_url",
  "mjpeg",
  "hls",
  "rtsp",
  "custom",
]);

export const userRoleEnum = pgEnum("user_role", ["owner", "admin"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  planMonths: integer("plan_months").notNull().default(12),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tenants_slug_unique").on(t.slug),
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
]);

export const cameras = pgTable("cameras", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  feedType: feedTypeEnum("feed_type").notNull(),
  feedUrl: text("feed_url").notNull(),
  feedConfig: jsonb("feed_config").$type<Record<string, unknown>>().notNull().default({}),
  intervalMinutes: integer("interval_minutes").notNull().default(15),
  activeFrom: time("active_from").notNull().default("00:00"),
  activeTo: time("active_to").notNull().default("23:59"),
  timezone: text("timezone").notNull().default("UTC"),
  enabled: boolean("enabled").notNull().default(true),
  theme: text("theme").notNull().default("light"),
  lastCaptureAt: timestamp("last_capture_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("cameras_tenant_idx").on(t.tenantId),
  index("cameras_enabled_idx").on(t.enabled),
]);

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  cameraId: uuid("camera_id")
    .notNull()
    .references(() => cameras.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  storageKey: text("storage_key").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("images_camera_timestamp_idx").on(t.cameraId, t.timestamp.desc()),
]);

export const tables = { tenants, users, cameras, images };