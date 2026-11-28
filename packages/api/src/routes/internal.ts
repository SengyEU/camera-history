import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  HttpError,
  LEAD_ACTIVITY_TYPES,
  LEAD_ARCHIVEABLE,
  LEAD_PRIORITIES,
  LEAD_PROPOSAL_STATUSES,
  LEAD_STATUSES,
  isClosedLeadStatus,
  isLeadActivityType,
  isLeadArchiveable,
  isLeadPriority,
  isLeadProposalStatus,
  isLeadStatus,
  leadPackageForCameraCount,
  rfc7807,
  slugify,
  type Lead,
  type LeadActivityType,
  type LeadPatch,
  type LeadPriority,
  type LeadStatus,
  type LeadSummary,
  type NewLead,
} from "@ch/core";
import type { AppDeps } from "../app.js";
import { requireAuth } from "../plugins/auth.js";

const MAX_NAME = 200;
const MAX_TEXT = 5000;
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const FOLLOW_UP_DAYS = 4;

const RATE_LIMIT = { max: 120, timeWindow: "1 minute" };

const LEAD_CSV_HEADER = [
  "slug",
  "company",
  "website",
  "country",
  "segment",
  "priority",
  "camera_count",
  "camera_locations",
  "wordpress",
  "layout",
  "package",
  "feed_type",
  "feed_url",
  "archiveable",
  "archive_reason",
  "contact_name",
  "email",
  "phone",
  "language",
  "status",
  "last_contact",
  "next_follow_up",
  "worldcam_url",
  "live_cam_url",
  "notes",
  "proposal_status",
  "pilot_started",
  "pilot_ends",
  "feedback",
  "case_study_consent",
  "lost_reason",
  "created_at",
  "updated_at",
];

type Body = Record<string, unknown>;

function internalGuard(app: FastifyInstance, deps: AppDeps) {
  const auth = requireAuth(app);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await auth(req, reply);
    if (reply.sent) return;
    const email = req.user?.email?.toLowerCase() ?? "";
    if (!deps.cfg.internal.emails.includes(email)) {
      return reply
        .code(404)
        .type("application/problem+json")
        .send(rfc7807(404, "not_found", "not found"));
    }
  };
}

function readString(body: Body, key: string, max = MAX_TEXT): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return "";
  if (typeof value !== "string") {
    throw new HttpError(400, "bad_request", `${key} must be a string`);
  }
  return value.trim().slice(0, max);
}

function readRequiredString(body: Body, key: string, max = MAX_NAME): string {
  const value = readString(body, key, max);
  if (!value) throw new HttpError(400, "bad_request", `${key} is required`);
  return value;
}

function readInt(body: Body, key: string): number | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10000) {
    throw new HttpError(400, "bad_request", `${key} must be a positive integer`);
  }
  return number;
}

function readBool(body: Body, key: string): boolean | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "yes" || value === "1") return true;
  if (value === "false" || value === "no" || value === "0") return false;
  throw new HttpError(400, "bad_request", `${key} must be a boolean`);
}

function readDate(body: Body, key: string): Date | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null || value === "") return null;
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new HttpError(400, "bad_request", `${key} must be an ISO date`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "bad_request", `${key} must be an ISO date`);
  }
  return date;
}

function readEnum<T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[],
  guard: (value: string) => value is T,
): T | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== "string" || !guard(value)) {
    throw new HttpError(400, "bad_request", `${key} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function readEmail(body: Body): string | undefined {
  const email = readString(body, "email", 320);
  if (email === undefined || email === "") return email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "bad_request", "email must be a valid email address");
  }
  return email;
}

function readUrl(body: Body, key: string): string | undefined {
  const value = readString(body, key, 1000);
  if (value === undefined || value === "") return value;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("scheme");
  } catch {
    throw new HttpError(400, "bad_request", `${key} must be an http(s) URL`);
  }
  return value;
}

function buildPatch(body: Body): LeadPatch {
  const patch: LeadPatch = {};
  const slug = readString(body, "slug", 120);
  if (slug !== undefined) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new HttpError(400, "bad_request", "slug must contain only lowercase letters, numbers and dashes");
    }
    patch.slug = slug;
  }
  for (const key of [
    "company",
    "country",
    "segment",
    "cameraLocations",
    "feedType",
    "archiveReason",
    "contactName",
    "phone",
    "language",
    "source",
    "notes",
    "feedback",
    "lostReason",
  ] as const) {
    const value = readString(body, key, key === "notes" || key === "feedback" ? MAX_TEXT : MAX_NAME);
    if (value !== undefined) patch[key] = value;
  }
  if (patch.company !== undefined && patch.company === "") {
    throw new HttpError(400, "bad_request", "company is required");
  }
  const website = readUrl(body, "website");
  if (website !== undefined) {
    if (!website) throw new HttpError(400, "bad_request", "website is required");
    patch.website = website;
  }
  const liveCamUrl = readUrl(body, "liveCamUrl");
  if (liveCamUrl !== undefined) patch.liveCamUrl = liveCamUrl;
  const sourceUrl = readUrl(body, "sourceUrl");
  if (sourceUrl !== undefined) patch.sourceUrl = sourceUrl;
  const feedUrl = readString(body, "feedUrl", 1000);
  if (feedUrl !== undefined) patch.feedUrl = feedUrl;

  const cameraCount = readInt(body, "cameraCount");
  if (cameraCount !== undefined) patch.cameraCount = cameraCount;
  const priority = readEnum(body, "priority", LEAD_PRIORITIES, isLeadPriority);
  if (priority) patch.priority = priority;
  const status = readEnum(body, "status", LEAD_STATUSES, isLeadStatus);
  if (status) patch.status = status;
  const archiveable = readEnum(body, "archiveable", LEAD_ARCHIVEABLE, isLeadArchiveable);
  if (archiveable) patch.archiveable = archiveable;
  const proposalStatus = readEnum(body, "proposalStatus", LEAD_PROPOSAL_STATUSES, isLeadProposalStatus);
  if (proposalStatus) patch.proposalStatus = proposalStatus;

  const wordpress = readBool(body, "wordpress");
  if (wordpress !== undefined) patch.wordpress = wordpress;
  const caseStudyConsent = readBool(body, "caseStudyConsent");
  if (caseStudyConsent !== undefined) patch.caseStudyConsent = caseStudyConsent;

  for (const key of ["lastContactAt", "nextFollowUpAt", "pilotStartedAt", "pilotEndsAt"] as const) {
    const value = readDate(body, key);
    if (value !== undefined) patch[key] = value;
  }

  const email = readEmail(body);
  if (email !== undefined) patch.email = email;

  const packageCode = readString(body, "packageCode", 20);
  if (packageCode !== undefined) {
    if (packageCode !== "custom" && !["solo", "starter", "plus", "pro", "network"].includes(packageCode)) {
      throw new HttpError(400, "bad_request", "packageCode is not a known package");
    }
    patch.packageCode = packageCode as LeadPatch["packageCode"];
  }

  if (patch.cameraCount !== undefined && patch.packageCode === undefined) {
    patch.packageCode = leadPackageForCameraCount(patch.cameraCount);
  }

  return patch;
}

async function uniqueSlug(deps: AppDeps, base: string): Promise<string> {
  const clean = base || "lead";
  let candidate = clean;
  let suffix = 2;
  while (await deps.repos.getLeadBySlug(candidate)) {
    candidate = `${clean}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function summarize(leads: Lead[], now: Date): LeadSummary {
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<LeadStatus, number>;
  let dueFollowUps = 0;
  let withEmail = 0;
  for (const lead of leads) {
    byStatus[lead.status] += 1;
    if (lead.email) withEmail += 1;
    if (
      lead.nextFollowUpAt &&
      lead.nextFollowUpAt.getTime() <= now.getTime() &&
      !isClosedLeadStatus(lead.status)
    ) {
      dueFollowUps += 1;
    }
  }
  return { total: leads.length, dueFollowUps, withEmail, byStatus };
}

function withPilotDates(patch: LeadPatch, now: Date, durationDays: number): LeadPatch {
  if (patch.status !== "pilot") return patch;
  return {
    ...patch,
    pilotStartedAt: patch.pilotStartedAt ?? now,
    pilotEndsAt:
      patch.pilotEndsAt ?? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
    nextFollowUpAt: null,
  };
}

function isContactActivity(type: LeadActivityType): boolean {
  return type === "email_sent" || type === "reply" || type === "call" || type === "meeting";
}

async function recordStatusChange(
  deps: AppDeps,
  lead: Lead,
  previous: LeadStatus,
  email: string,
  now: Date,
): Promise<void> {
  if (lead.status === previous) return;
  await deps.repos.createLeadActivity({
    leadId: lead.id,
    type: "status_change",
    body: `${previous} → ${lead.status}`,
    occurredAt: now,
    createdBy: email,
  });
}

export function registerInternalRoutes(app: FastifyInstance, deps: AppDeps) {
  const pre = internalGuard(app, deps);

  app.get("/api/v1/internal/me", { preHandler: pre }, async (req) => ({
    email: req.user!.email,
  }));

  app.get("/api/v1/internal/leads", { preHandler: pre }, async () => {
    const leads = await deps.repos.listLeads();
    return { leads, summary: summarize(leads, new Date()) };
  });

  app.get("/api/v1/internal/leads/export.csv", { preHandler: pre }, async (_req, reply) => {
    const leads = await deps.repos.listLeads();
    const lines = [LEAD_CSV_HEADER.join(",")];
    for (const lead of leads) {
      lines.push(
        [
          lead.slug,
          lead.company,
          lead.website,
          lead.country,
          lead.segment,
          lead.priority,
          String(lead.cameraCount),
          lead.cameraLocations,
          lead.wordpress ? "yes" : "no",
          lead.layout,
          lead.packageCode,
          lead.feedType,
          lead.feedUrl,
          lead.archiveable,
          lead.archiveReason,
          lead.contactName,
          lead.email,
          lead.phone,
          lead.language,
          lead.status,
          lead.lastContactAt?.toISOString() ?? "",
          lead.nextFollowUpAt?.toISOString() ?? "",
          lead.sourceUrl,
          lead.liveCamUrl,
          lead.notes,
          lead.proposalStatus,
          lead.pilotStartedAt?.toISOString() ?? "",
          lead.pilotEndsAt?.toISOString() ?? "",
          lead.feedback,
          lead.caseStudyConsent ? "yes" : "no",
          lead.lostReason,
          lead.createdAt.toISOString(),
          lead.updatedAt.toISOString(),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const fileDate = new Date().toISOString().slice(0, 10);
    return reply
      .type("text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="camera-history-leads-${fileDate}.csv"`)
      .send(lines.join("\n"));
  });

  app.get("/api/v1/internal/leads/:id", { preHandler: pre }, async (req) => {
    const { id } = req.params as { id: string };
    const lead = await deps.repos.getLead(id);
    if (!lead) throw new HttpError(404, "not_found", "lead not found");
    const activities = await deps.repos.listLeadActivities(id);
    return { lead, activities };
  });

  app.post(
    "/api/v1/internal/leads",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req, reply) => {
      const body = (req.body ?? {}) as Body;
      const patch = buildPatch(body);
      const company = readRequiredString(body, "company");
      const website = patch.website ?? readRequiredString(body, "website", 1000);
      const baseSlug = patch.slug ?? slugify(company);
      const cameraCount = patch.cameraCount ?? 1;
      const lead = await deps.repos.createLead({
        ...patch,
        slug: await uniqueSlug(deps, baseSlug),
        company,
        website,
        cameraCount,
        packageCode: patch.packageCode ?? leadPackageForCameraCount(cameraCount),
      } as NewLead);
      return reply.code(201).send({ lead });
    },
  );

  app.patch(
    "/api/v1/internal/leads/:id",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req) => {
      const { id } = req.params as { id: string };
      const existing = await deps.repos.getLead(id);
      if (!existing) throw new HttpError(404, "not_found", "lead not found");
      const now = new Date();
      let patch = buildPatch((req.body ?? {}) as Body);
      if (patch.slug && patch.slug !== existing.slug) {
        const clash = await deps.repos.getLeadBySlug(patch.slug);
        if (clash && clash.id !== id) throw new HttpError(409, "conflict", "slug is already used");
      }
      if (patch.cameraCount !== undefined && patch.packageCode === undefined) {
        patch = { ...patch, packageCode: leadPackageForCameraCount(patch.cameraCount) };
      }
      if (patch.status && patch.status !== "pilot") {
        // keep existing pilot dates when moving out of pilot
      } else if (patch.status === "pilot") {
        patch = withPilotDates(patch, now, deps.cfg.pilot.durationDays);
      }
      if (patch.status === "won" || patch.status === "lost" || patch.status === "not_now") {
        patch.nextFollowUpAt = null;
      }
      const lead = await deps.repos.updateLead(id, patch);
      if (!lead) throw new HttpError(404, "not_found", "lead not found");
      await recordStatusChange(deps, lead, existing.status, req.user!.email, now);
      return { lead };
    },
  );

  app.delete(
    "/api/v1/internal/leads/:id",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await deps.repos.getLead(id);
      if (!existing) throw new HttpError(404, "not_found", "lead not found");
      await deps.repos.deleteLead(id);
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/v1/internal/leads/:id/activities",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await deps.repos.getLead(id);
      if (!existing) throw new HttpError(404, "not_found", "lead not found");
      const body = (req.body ?? {}) as Body;
      const type = readEnum(body, "type", LEAD_ACTIVITY_TYPES, isLeadActivityType);
      if (!type) throw new HttpError(400, "bad_request", "type is required");
      const text = readString(body, "body", MAX_TEXT) ?? "";
      const occurredAt = readDate(body, "occurredAt") ?? new Date();
      const activity = await deps.repos.createLeadActivity({
        leadId: id,
        type,
        body: text,
        occurredAt,
        createdBy: req.user!.email,
      });

      const now = new Date();
      const patch: LeadPatch = {};
      if (isContactActivity(type)) patch.lastContactAt = occurredAt;
      if (type === "email_sent") {
        if (existing.status === "new" || existing.status === "reviewed") patch.status = "contacted";
        patch.nextFollowUpAt = new Date(occurredAt.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);
      }
      if (type === "reply") {
        patch.status = "replied";
        patch.nextFollowUpAt = null;
      }
      if (type === "proposal_sent") patch.proposalStatus = "sent";
      if (type === "pilot_started") {
        patch.status = "pilot";
        patch.pilotStartedAt = occurredAt;
        patch.pilotEndsAt = new Date(
          occurredAt.getTime() + deps.cfg.pilot.durationDays * 24 * 60 * 60 * 1000,
        );
        patch.nextFollowUpAt = null;
      }
      const lead =
        Object.keys(patch).length > 0
          ? await deps.repos.updateLead(id, patch)
          : existing;
      if (!lead) throw new HttpError(404, "not_found", "lead not found");
      await recordStatusChange(deps, lead, existing.status, req.user!.email, now);
      return reply.code(201).send({ activity, lead });
    },
  );

  app.post(
    "/api/v1/internal/leads/import",
    { preHandler: pre, bodyLimit: MAX_CSV_BYTES, config: { rateLimit: RATE_LIMIT } },
    async (req) => {
      if (typeof req.body !== "string" || !req.body.trim()) {
        throw new HttpError(400, "bad_request", "CSV body is required");
      }
      const rows = parseCsv(req.body);
      if (rows.length < 2) throw new HttpError(400, "bad_request", "CSV has no data rows");
      const header = rows[0]!.map((cell) => cell.replace(/^\uFEFF/, "").trim().toLowerCase());
      const dataRows = rows.slice(1);
      if (dataRows.length > MAX_IMPORT_ROWS) {
        throw new HttpError(400, "bad_request", `CSV is limited to ${MAX_IMPORT_ROWS} rows`);
      }
      const index = (name: string) => header.indexOf(name);
      const cell = (row: string[], name: string) => {
        const at = index(name);
        return at === -1 ? "" : (row[at] ?? "").trim();
      };
      const errors: Array<{ row: number; message: string }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const [offset, row] of dataRows.entries()) {
        const rowNumber = offset + 2;
        try {
          const company = cell(row, "company").slice(0, MAX_NAME);
          const website = cell(row, "website").slice(0, 1000);
          if (!company || !website) throw new Error("company and website are required");
          const cameraCount = Number(cell(row, "camera_count") || 1);
          if (!Number.isInteger(cameraCount) || cameraCount < 1) {
            throw new Error("camera_count must be a positive integer");
          }
          const priorityRaw = cell(row, "priority").toLowerCase();
          const priority: LeadPriority = isLeadPriority(priorityRaw) ? priorityRaw : "medium";
          const archiveRaw = cell(row, "archiveable").toLowerCase();
          const archiveable = isLeadArchiveable(archiveRaw) ? archiveRaw : "maybe";
          const packageRaw = cell(row, "package").toLowerCase();
          const packageCode =
            packageRaw === "custom"
              ? "custom"
              : ["solo", "starter", "plus", "pro", "network"].includes(packageRaw)
                ? (packageRaw as "solo" | "starter" | "plus" | "pro" | "network")
                : leadPackageForCameraCount(cameraCount);
          const slug = (cell(row, "slug") || slugify(company)).slice(0, 120);
          if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug contains invalid characters");
          const wordpress = !["no", "false", "0"].includes(cell(row, "wordpress").toLowerCase());
          const sourceUrl = cell(row, "worldcam_url");
          const source = sourceUrl ? "WorldCam" : "";
          const values: NewLead = {
            slug,
            company,
            website,
            country: cell(row, "country").slice(0, MAX_NAME),
            segment: cell(row, "segment").slice(0, MAX_NAME),
            priority,
            cameraCount,
            cameraLocations: cell(row, "camera_locations").slice(0, MAX_TEXT),
            packageCode,
            wordpress,
            layout: ["one-page", "separate-pages"].includes(cell(row, "layout"))
              ? cell(row, "layout")
              : "separate-pages",
            feedType: cell(row, "feed_type").slice(0, 40),
            feedUrl: cell(row, "feed_url").slice(0, 1000),
            archiveable,
            archiveReason: cell(row, "archive_reason").slice(0, MAX_TEXT),
            contactName: cell(row, "contact_name").slice(0, MAX_NAME),
            email: cell(row, "email").slice(0, 320),
            phone: cell(row, "phone").slice(0, 80),
            language: cell(row, "language").slice(0, 40),
            source,
            sourceUrl,
            liveCamUrl: cell(row, "live_cam_url").slice(0, 1000),
            notes: cell(row, "notes").slice(0, MAX_TEXT),
          };
          const statusCell = cell(row, "status").toLowerCase();
          const status = isLeadStatus(statusCell) ? statusCell : "new";
          const existing = await deps.repos.getLeadBySlug(slug);
          if (existing) {
            // Keep manual pipeline state, notes and contact dates on re-import.
            // Empty source cells never wipe a value that was filled in by hand.
            const always = new Set([
              "company",
              "website",
              "priority",
              "cameraCount",
              "packageCode",
              "wordpress",
              "layout",
              "feedType",
              "archiveable",
            ]);
            const sourceValues = Object.fromEntries(
              Object.entries(values).filter(
                ([key, value]) =>
                  key !== "notes" &&
                  (always.has(key) || (value !== "" && value !== null && value !== undefined)),
              ),
            ) as NewLead;
            await deps.repos.updateLead(existing.id, sourceValues);
            updated += 1;
          } else {
            await deps.repos.createLead({
              ...values,
              status,
              lastContactAt: parseDateCell(cell(row, "last_contact")),
              nextFollowUpAt: parseDateCell(cell(row, "next_follow_up")),
            });
            created += 1;
          }
        } catch (error) {
          skipped += 1;
          if (errors.length < 50) {
            errors.push({
              row: rowNumber,
              message: error instanceof Error ? error.message : "invalid row",
            });
          }
        }
      }
      return { created, updated, skipped, errors };
    },
  );
}

function parseDateCell(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
