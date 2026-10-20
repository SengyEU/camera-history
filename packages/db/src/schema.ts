import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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

export const cameraStatusEnum = pgEnum("camera_status", ["operational", "delayed", "offline"]);

export const billingStatusEnum = pgEnum("billing_status", ["none", "active", "past_due", "unpaid", "canceled"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  planMonths: numeric("plan_months", { precision: 4, scale: 1 })
    .notNull()
    .default("12"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingStatus: billingStatusEnum("billing_status").notNull().default("none"),
  billingGraceUntil: timestamp("billing_grace_until", { withTimezone: true }),
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
  themeColors: jsonb("theme_colors").$type<import("@ch/core").ThemeColors | null>(),
  planMonths: numeric("plan_months", { precision: 4, scale: 1 }),
  timeFormat: text("time_format").notNull().default("12h"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  daylightOnly: boolean("daylight_only").notNull().default(false),
  showNight: boolean("show_night").notNull().default(false),
  lastCaptureAt: timestamp("last_capture_at", { withTimezone: true }),
  lastError: text("last_error"),
  status: cameraStatusEnum("status").notNull().default("operational"),
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

export const cameraGroups = pgTable(
  "camera_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("camera_groups_tenant_slug_unique").on(t.tenantId, t.slug)],
);

export const cameraGroupMembers = pgTable(
  "camera_group_members",
  {
    cameraGroupId: uuid("camera_group_id")
      .notNull()
      .references(() => cameraGroups.id, { onDelete: "cascade" }),
    cameraId: uuid("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.cameraGroupId, t.cameraId] }),
    index("camera_group_members_camera_idx").on(t.cameraId),
    index("camera_group_members_group_position_idx").on(t.cameraGroupId, t.position),
  ],
);

export const tables = { tenants, users, cameras, images, cameraGroups, cameraGroupMembers };