import type { FastifyInstance } from "fastify";
import {
  CAPTURE_INTERVAL_MINUTES,
  NAME_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_RE,
  THEMES,
  cameraLimitForPackage,
  isValidTheme,
  normalizeThemeColors,
  packageForCode,
  slugify,
  HttpError,
  rfc7807,
} from "@ch/core";
import type { AppDeps } from "../app.js";
import { requireAuth } from "../plugins/auth.js";

const FEED_TYPES = ["static_url", "mjpeg", "hls", "rtsp", "custom", "ipcamlive"];
const TIME_FORMATS = ["12h", "24h"] as const;
const RATE_LIMIT = { max: 300, timeWindow: "1 minute" };

const notFound = () => rfc7807(404, "not_found", "camera not found");

function schemeMatches(feedType: string, feedUrl: string): boolean {
  switch (feedType) {
    case "rtsp":
      return feedUrl.startsWith("rtsp://");
    case "custom":
      return feedUrl.startsWith("wss://");
    case "ipcamlive":
      return (
        feedUrl.startsWith("http://") ||
        feedUrl.startsWith("https://") ||
        /^[A-Za-z0-9_-]+$/.test(feedUrl)
      );
    default:
      return feedUrl.startsWith("http://") || feedUrl.startsWith("https://");
  }
}

function normalizeName(value: unknown, label = "name"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new HttpError(400, "bad_request", `${label} is required`);
  if (name.length > NAME_MAX_LENGTH) {
    throw new HttpError(400, "bad_request", `${label} must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return name;
}

function normalizeSlug(value: unknown, fallback: string): string {
  const slug = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (slug.length > SLUG_MAX_LENGTH || !SLUG_RE.test(slug)) {
    throw new HttpError(
      400,
      "bad_request",
      `slug must be at most ${SLUG_MAX_LENGTH} lowercase letters, numbers and dashes`,
    );
  }
  return slug;
}

function publicImageUrl(baseUrl: string, cameraId: string, storageKey: string): string {
  const parts = storageKey.split("/");
  const date = parts[parts.length - 2];
  const file = parts[parts.length - 1];
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/cameras/${cameraId}/${date}/${file}`;
}

function parseTimeFormat(value: unknown): "12h" | "24h" {
  if (value === undefined || value === null) return "12h";
  if (typeof value !== "string" || !TIME_FORMATS.includes(value as (typeof TIME_FORMATS)[number])) {
    throw new HttpError(400, "bad_request", "timeFormat must be 12h or 24h");
  }
  return value as "12h" | "24h";
}

function parseCoordinate(value: unknown, field: "latitude" | "longitude"): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, "bad_request", `${field} must be a number`);
  }
  const limit = field === "latitude" ? 90 : 180;
  if (value < -limit || value > limit) {
    throw new HttpError(400, "bad_request", `${field} must be between -${limit} and ${limit}`);
  }
  return value;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps) {
  const pre = requireAuth(app);

  app.get("/api/v1/admin/cameras", { preHandler: pre }, async (req) => {
    const tenantId = req.user!.tenantId;
    const [cameras, stats] = await Promise.all([
      deps.repos.listCameras(tenantId),
      deps.repos.cameraStats(tenantId),
    ]);
    return {
      cameras: cameras.map((camera) => ({
        ...camera,
        ...(stats.get(camera.id) ?? {
          imageCount: 0,
          totalBytes: 0,
          firstCaptureAt: null,
          lastCaptureAt: null,
        }),
      })),
    };
  });

  app.post("/api/v1/admin/cameras", { preHandler: pre, config: { rateLimit: RATE_LIMIT } }, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const name = normalizeName(body.name);
    const feedType = String(body.feedType ?? "");
    const feedUrl = typeof body.feedUrl === "string" ? body.feedUrl : "";

    if (!FEED_TYPES.includes(feedType)) {
      throw new HttpError(400, "bad_request", `feedType must be one of ${FEED_TYPES.join(", ")}`);
    }
    const theme = typeof body.theme === "string" ? body.theme : "light";
    if (!isValidTheme(theme)) {
      throw new HttpError(400, "bad_request", `theme must be one of ${THEMES.join(", ")}`);
    }
    let themeColors = null;
    if (body.themeColors !== undefined && body.themeColors !== null) {
      themeColors = normalizeThemeColors(body.themeColors);
      if (!themeColors) {
        throw new HttpError(400, "bad_request", "themeColors must contain valid #rrggbb colors");
      }
    }
    if (theme === "custom" && !themeColors) {
      throw new HttpError(400, "bad_request", "themeColors are required when theme is custom");
    }
    if (!schemeMatches(feedType, feedUrl)) {
      throw new HttpError(400, "bad_request", `feedUrl scheme does not match feedType "${feedType}"`);
    }
    const timeFormat = parseTimeFormat(body.timeFormat);

    const latitude = parseCoordinate(body.latitude, "latitude");
    const longitude = parseCoordinate(body.longitude, "longitude");
    let daylightOnly = false;
    if (body.daylightOnly !== undefined) {
      if (typeof body.daylightOnly !== "boolean") {
        throw new HttpError(400, "bad_request", "daylightOnly must be a boolean");
      }
      daylightOnly = body.daylightOnly;
    }
    if (daylightOnly && (latitude === null || longitude === null)) {
      throw new HttpError(
        400,
        "bad_request",
        "latitude and longitude are required when daylightOnly is enabled",
      );
    }
    let showNight = false;
    if (body.showNight !== undefined) {
      if (typeof body.showNight !== "boolean") {
        throw new HttpError(400, "bad_request", "showNight must be a boolean");
      }
      showNight = body.showNight;
    }

    const slug = normalizeSlug(body.slug, slugify(name));
    const existingCameras = await deps.repos.listCameras(req.user!.tenantId);
    if (existingCameras.some((camera) => camera.slug === slug)) {
      throw new HttpError(409, "conflict", "camera slug already taken");
    }

    const tenant = await deps.repos.getTenantById(req.user!.tenantId);
    if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
    const tier = packageForCode(tenant.packageCode);
    const limit = cameraLimitForPackage(tenant.packageCode);
    const result = await deps.repos.createCameraWithLimit(req.user!.tenantId, {
      name,
      slug,
      feedType: feedType as never,
      feedUrl,
      intervalMinutes: CAPTURE_INTERVAL_MINUTES,
      activeFrom: String(body.activeFrom ?? "00:00"),
      activeTo: String(body.activeTo ?? "23:59"),
      timezone: String(body.timezone ?? "UTC"),
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      theme,
      themeColors,
      timeFormat,
      latitude,
      longitude,
      daylightOnly,
      showNight,
    }, limit);
    if (!result.camera) {
      req.log.warn(
        {
          tenantId: req.user!.tenantId,
          packageCode: tenant.packageCode,
          cameraCount: result.cameraCount,
          limit,
        },
        "camera_limit_reached",
      );
      throw new HttpError(
        409,
        "camera_limit_reached",
        `Package ${tier?.name ?? tenant.packageCode} allows ${limit} cameras. Upgrade to add more.`,
      );
    }
    return reply.code(201).send({ camera: result.camera });
  });

  app.get("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(notFound());
    }
    return { camera };
  });

  app.put("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(notFound());
    }
    const body = req.body as Record<string, unknown>;
    const patch = Object.fromEntries(
      Object.entries(body).filter(([k]) =>
        [
          "name",
          "slug",
          "feedType",
          "feedUrl",
          "activeFrom",
          "activeTo",
          "timezone",
          "enabled",
          "theme",
          "themeColors",
          "timeFormat",
          "latitude",
          "longitude",
          "daylightOnly",
          "showNight",
        ].includes(k),
      ),
    );
    const effectiveType = patch.feedType !== undefined ? String(patch.feedType) : camera.feedType;
    const effectiveUrl = patch.feedUrl !== undefined ? String(patch.feedUrl) : camera.feedUrl;
    if (patch.name !== undefined) {
      patch.name = normalizeName(patch.name);
    }
    if (patch.slug !== undefined) {
      patch.slug = normalizeSlug(patch.slug, camera.slug);
      const existingCameras = await deps.repos.listCameras(req.user!.tenantId);
      if (existingCameras.some((item) => item.slug === patch.slug && item.id !== camera.id)) {
        throw new HttpError(409, "conflict", "camera slug already taken");
      }
    }
    if (!schemeMatches(effectiveType, effectiveUrl)) {
      throw new HttpError(400, "bad_request", `feedUrl scheme does not match feedType "${effectiveType}"`);
    }
    if (patch.theme !== undefined && !isValidTheme(String(patch.theme))) {
      throw new HttpError(400, "bad_request", `theme must be one of ${THEMES.join(", ")}`);
    }
    if (patch.timeFormat !== undefined) {
      patch.timeFormat = parseTimeFormat(patch.timeFormat);
    }
    if (patch.themeColors !== undefined && patch.themeColors !== null) {
      const colors = normalizeThemeColors(patch.themeColors);
      if (!colors) {
        throw new HttpError(400, "bad_request", "themeColors must contain valid #rrggbb colors");
      }
      patch.themeColors = colors;
    }
    const effectiveTheme = patch.theme !== undefined ? String(patch.theme) : camera.theme;
    if (effectiveTheme === "custom" && !(patch.themeColors ?? camera.themeColors)) {
      throw new HttpError(400, "bad_request", "themeColors are required when theme is custom");
    }
    if (effectiveTheme === "custom" && patch.themeColors === null) {
      throw new HttpError(400, "bad_request", "themeColors are required when theme is custom");
    }
    const effectiveLatitude =
      patch.latitude !== undefined ? parseCoordinate(patch.latitude, "latitude") : camera.latitude;
    const effectiveLongitude =
      patch.longitude !== undefined
        ? parseCoordinate(patch.longitude, "longitude")
        : camera.longitude;
    let effectiveDaylightOnly = camera.daylightOnly;
    if (patch.daylightOnly !== undefined) {
      if (typeof patch.daylightOnly !== "boolean") {
        throw new HttpError(400, "bad_request", "daylightOnly must be a boolean");
      }
      effectiveDaylightOnly = patch.daylightOnly;
    }
    if (effectiveDaylightOnly && (effectiveLatitude === null || effectiveLongitude === null)) {
      throw new HttpError(
        400,
        "bad_request",
        "latitude and longitude are required when daylightOnly is enabled",
      );
    }
    if (patch.showNight !== undefined && typeof patch.showNight !== "boolean") {
      throw new HttpError(400, "bad_request", "showNight must be a boolean");
    }
    if (patch.latitude !== undefined) patch.latitude = effectiveLatitude;
    if (patch.longitude !== undefined) patch.longitude = effectiveLongitude;
    if (patch.daylightOnly !== undefined) patch.daylightOnly = effectiveDaylightOnly;
    patch.intervalMinutes = CAPTURE_INTERVAL_MINUTES;
    const updated = await deps.repos.updateCamera(id, patch as never);
    return { camera: updated };
  });

  app.delete("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(notFound());
    }
    const archived = await deps.repos.listImagesForCamera(id);
    await deps.repos.deleteCamera(id);
    for (const image of archived) {
      try {
        await deps.storage.remove(image.storageKey);
      } catch (error) {
        req.log.warn({ err: error, cameraId: id, storageKey: image.storageKey }, "camera archive orphan");
      }
    }
    return reply.code(204).send();
  });

  app.get("/api/v1/admin/cameras/:id/preview", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(notFound());
    }
    const latest = await deps.repos.latestImageForCamera(id);
    return {
      latest: latest
        ? {
            id: latest.id,
            timestamp: latest.timestamp,
            sizeBytes: latest.sizeBytes,
            url: publicImageUrl(deps.cfg.api.publicBaseUrl, id, latest.storageKey),
          }
        : null,
    };
  });

  app.get("/api/v1/admin/groups", { preHandler: pre }, async (req) => {
    return { groups: await deps.repos.listGroups(req.user!.tenantId) };
  });

  app.post("/api/v1/admin/groups", { preHandler: pre, config: { rateLimit: RATE_LIMIT } }, async (req, reply) => {
    const body = (req.body ?? {}) as { name?: unknown; slug?: unknown };
    const name = normalizeName(body.name);
    const slug = normalizeSlug(body.slug, "");
    const all = await deps.repos.listGroups(req.user!.tenantId);
    if (all.some((g) => g.slug === slug)) throw new HttpError(409, "conflict", "group slug already taken");
    const group = await deps.repos.createGroup(req.user!.tenantId, { name, slug });
    return reply.code(201).send({ group: { id: group.id, name: group.name, slug: group.slug, cameraIds: [] } });
  });

  app.get<{ Params: { id: string } }>("/api/v1/admin/groups/:id", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    const all = await deps.repos.listGroups(req.user!.tenantId);
    return { group: all.find((g) => g.id === group.id)! };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/admin/groups/:id", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    const body = (req.body ?? {}) as { name?: unknown; slug?: unknown };
    const patch: { name?: string; slug?: string } = {};
    if (body.name !== undefined) {
      patch.name = normalizeName(body.name);
    }
    if (body.slug !== undefined) {
      const slug = normalizeSlug(body.slug, "");
      const all = await deps.repos.listGroups(req.user!.tenantId);
      if (all.some((g) => g.slug === slug && g.id !== group.id)) {
        throw new HttpError(409, "conflict", "group slug already taken");
      }
      patch.slug = slug;
    }
    if (patch.name === undefined && patch.slug === undefined) {
      throw new HttpError(400, "bad_request", "name or slug is required");
    }
    await deps.repos.updateGroup(group.id, patch);
    const all2 = await deps.repos.listGroups(req.user!.tenantId);
    return { group: all2.find((g) => g.id === group.id)! };
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/groups/:id", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    await deps.repos.deleteGroup(group.id);
    return reply.code(204).send();
  });

  app.put<{ Params: { id: string } }>("/api/v1/admin/groups/:id/cameras", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    const body = (req.body ?? {}) as { cameraIds?: unknown };
    if (!Array.isArray(body.cameraIds) || body.cameraIds.some((x) => typeof x !== "string")) {
      throw new HttpError(400, "bad_request", "cameraIds must be an array of camera ids");
    }
    const ownedIds = new Set((await deps.repos.listCameras(req.user!.tenantId)).map((c) => c.id));
    if ((body.cameraIds as string[]).some((id) => !ownedIds.has(id))) {
      throw new HttpError(400, "bad_request", "cameraIds must reference your own cameras");
    }
    await deps.repos.setGroupCameras(group.id, body.cameraIds as string[]);
    return reply.code(204).send();
  });

  app.get("/api/v1/admin/tenant", { preHandler: pre }, async (req, reply) => {
    const t = await deps.repos.getTenantById(req.user!.tenantId);
    if (!t) return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Tenant not found"));
    return {
      tenant: {
        id: t.id,
        name: t.name,
        slug: t.slug,
        email: req.user!.email,
        packageCode: t.packageCode,
        cameraLimit: cameraLimitForPackage(t.packageCode),
        billingStatus: t.billingStatus,
        isPilot: t.isPilot,
        pilotUntil: t.pilotUntil,
      },
    };
  });
}