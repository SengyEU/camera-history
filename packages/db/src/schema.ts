import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
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

export const leadPriorityEnum = pgEnum("lead_priority", ["high", "medium", "low"]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "reviewed",
  "contacted",
  "replied",
  "demo",
  "pilot",
  "won",
  "lost",
  "not_now",
]);

export const leadArchiveableEnum = pgEnum("lead_archiveable", ["yes", "maybe", "no"]);

export const leadProposalStatusEnum = pgEnum("lead_proposal_status", ["none", "drafted", "sent"]);

export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "note",
  "email_sent",
  "reply",
  "call",
  "meeting",
  "proposal_sent",
  "status_change",
  "pilot_started",
  "other",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  packageCode: text("package_code").notNull().default("starter"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingStatus: billingStatusEnum("billing_status").notNull().default("none"),
  billingGraceUntil: timestamp("billing_grace_until", { withTimezone: true }),
  isPilot: boolean("is_pilot").notNull().default(false),
  pilotUntil: timestamp("pilot_until", { withTimezone: true }),
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
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  welcomeSentAt: timestamp("welcome_sent_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
]);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_verification_tokens_hash_unique").on(t.tokenHash),
    index("email_verification_tokens_user_idx").on(t.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

export const cameras = pgTable("cameras", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  feedType: feedTypeEnum("feed_type").notNull(),
  feedUrl: text("feed_url").notNull(),
  feedConfig: jsonb("feed_config").$type<Record<string, unknown>>().notNull().default({}),
  intervalMinutes: integer("interval_minutes").notNull().default(60),
  activeFrom: time("active_from").notNull().default("00:00"),
  activeTo: time("active_to").notNull().default("23:59"),
  timezone: text("timezone").notNull().default("UTC"),
  enabled: boolean("enabled").notNull().default(true),
  theme: text("theme").notNull().default("light"),
  themeColors: jsonb("theme_colors").$type<import("@ch/core").ThemeColors | null>(),
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
  uniqueIndex("cameras_tenant_slug_unique").on(t.tenantId, t.slug),
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
  index("images_timestamp_idx").on(t.timestamp),
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

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    company: text("company").notNull(),
    website: text("website").notNull(),
    country: text("country").notNull().default(""),
    segment: text("segment").notNull().default(""),
    priority: leadPriorityEnum("priority").notNull().default("medium"),
    cameraCount: integer("camera_count").notNull().default(1),
    cameraLocations: text("camera_locations").notNull().default(""),
    packageCode: text("package_code").notNull().default("solo"),
    wordpress: boolean("wordpress").notNull().default(true),
    layout: text("layout").notNull().default("separate-pages"),
    feedType: text("feed_type").notNull().default("unknown"),
    feedUrl: text("feed_url").notNull().default(""),
    archiveable: leadArchiveableEnum("archiveable").notNull().default("maybe"),
    archiveReason: text("archive_reason").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    language: text("language").notNull().default(""),
    status: leadStatusEnum("status").notNull().default("new"),
    source: text("source").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    liveCamUrl: text("live_cam_url").notNull().default(""),
    notes: text("notes").notNull().default(""),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    proposalStatus: leadProposalStatusEnum("proposal_status").notNull().default("none"),
    pilotStartedAt: timestamp("pilot_started_at", { withTimezone: true }),
    pilotEndsAt: timestamp("pilot_ends_at", { withTimezone: true }),
    feedback: text("feedback").notNull().default(""),
    caseStudyConsent: boolean("case_study_consent").notNull().default(false),
    lostReason: text("lost_reason").notNull().default(""),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_slug_unique").on(t.slug),
    index("leads_status_idx").on(t.status),
    index("leads_priority_idx").on(t.priority),
    index("leads_next_follow_up_idx").on(t.nextFollowUpAt),
  ],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: leadActivityTypeEnum("type").notNull(),
    body: text("body").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_activities_lead_idx").on(t.leadId, t.occurredAt.desc()),
    index("lead_activities_occurred_idx").on(t.occurredAt),
  ],
);

export const tables = {
  tenants,
  users,
  cameras,
  images,
  cameraGroups,
  cameraGroupMembers,
  emailVerificationTokens,
  passwordResetTokens,
  leads,
  leadActivities,
};