import type { FastifyInstance } from "fastify";
import { THEMES, isValidTheme, HttpError, rfc7807 } from "@ch/core";
import type { AppDeps } from "../app.js";
import { requireAuth } from "../plugins/auth.js";

const FEED_TYPES = ["static_url", "mjpeg", "hls", "rtsp", "custom"];
const INTERVALS = [5, 15, 30, 60];
const RATE_LIMIT = { max: 300, timeWindow: "1 minute" };

const notFound = () => rfc7807(404, "not_found", "camera not found");

function schemeMatches(feedType: string, feedUrl: string): boolean {
  switch (feedType) {
    case "rtsp":
      return feedUrl.startsWith("rtsp://");
    case "custom":
      return feedUrl.startsWith("wss://");
    default:
      return feedUrl.startsWith("http://") || feedUrl.startsWith("https://");
  }
}

function publicImageUrl(baseUrl: string, cameraId: string, storageKey: string): string {
  const parts = storageKey.split("/");
  const date = parts[parts.length - 2];
  const file = parts[parts.length - 1];
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/cameras/${cameraId}/${date}/${file}`;
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
    const name = typeof body.name === "string" ? body.name : "";
    const feedType = String(body.feedType ?? "");
    const feedUrl = typeof body.feedUrl === "string" ? body.feedUrl : "";
    const intervalMinutes = Number(body.intervalMinutes ?? "15");

    if (!name) throw new HttpError(400, "bad_request", "name is required");
    if (!FEED_TYPES.includes(feedType)) {
      throw new HttpError(400, "bad_request", `feedType must be one of ${FEED_TYPES.join(", ")}`);
    }
    if (!INTERVALS.includes(intervalMinutes)) {
      throw new HttpError(400, "bad_request", "intervalMinutes must be one of 5, 15, 30, 60");
    }
    const theme = typeof body.theme === "string" ? body.theme : "light";
    if (!isValidTheme(theme)) {
      throw new HttpError(400, "bad_request", `theme must be one of ${THEMES.join(", ")}`);
    }
    if (!schemeMatches(feedType, feedUrl)) {
      throw new HttpError(400, "bad_request", `feedUrl scheme does not match feedType "${feedType}"`);
    }

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

    const camera = await deps.repos.createCamera(req.user!.tenantId, {
      name,
      feedType: feedType as never,
      feedUrl,
      intervalMinutes,
      activeFrom: String(body.activeFrom ?? "00:00"),
      activeTo: String(body.activeTo ?? "23:59"),
      timezone: String(body.timezone ?? "UTC"),
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      theme,
      latitude,
      longitude,
      daylightOnly,
      showNight,
    });
    return reply.code(201).send({ camera });
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
          "feedType",
          "feedUrl",
          "intervalMinutes",
          "activeFrom",
          "activeTo",
          "timezone",
          "enabled",
          "theme",
          "latitude",
          "longitude",
          "daylightOnly",
          "showNight",
        ].includes(k),
      ),
    );
    const effectiveType = patch.feedType !== undefined ? String(patch.feedType) : camera.feedType;
    const effectiveUrl = patch.feedUrl !== undefined ? String(patch.feedUrl) : camera.feedUrl;
    if (!schemeMatches(effectiveType, effectiveUrl)) {
      throw new HttpError(400, "bad_request", `feedUrl scheme does not match feedType "${effectiveType}"`);
    }
    if (patch.theme !== undefined && !isValidTheme(String(patch.theme))) {
      throw new HttpError(400, "bad_request", `theme must be one of ${THEMES.join(", ")}`);
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
    const updated = await deps.repos.updateCamera(id, patch as never);
    return { camera: updated };
  });

  app.delete("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(notFound());
    }
    await deps.repos.deleteCamera(id);
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

  const GROUP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  app.get("/api/v1/admin/groups", { preHandler: pre }, async (req) => {
    return { groups: await deps.repos.listGroups(req.user!.tenantId) };
  });

  app.post("/api/v1/admin/groups", { preHandler: pre, config: { rateLimit: RATE_LIMIT } }, async (req, reply) => {
    const body = (req.body ?? {}) as { name?: unknown; slug?: unknown };
    if (typeof body.name !== "string" || body.name.length === 0 || typeof body.slug !== "string") {
      throw new HttpError(400, "bad_request", "name and slug are required");
    }
    if (!GROUP_SLUG.test(body.slug)) throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
    const all = await deps.repos.listGroups(req.user!.tenantId);
    if (all.some((g) => g.slug === body.slug)) throw new HttpError(409, "conflict", "group slug already taken");
    const group = await deps.repos.createGroup(req.user!.tenantId, { name: body.name, slug: body.slug });
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
      if (typeof body.name !== "string" || body.name.length === 0) {
        throw new HttpError(400, "bad_request", "name must be a non-empty string");
      }
      patch.name = body.name;
    }
    if (body.slug !== undefined) {
      if (typeof body.slug !== "string" || !GROUP_SLUG.test(body.slug)) {
        throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
      }
      const all = await deps.repos.listGroups(req.user!.tenantId);
      if (all.some((g) => g.slug === body.slug && g.id !== group.id)) {
        throw new HttpError(409, "conflict", "group slug already taken");
      }
      patch.slug = body.slug;
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
    return { tenant: { id: t.id, name: t.name, slug: t.slug } };
  });
}