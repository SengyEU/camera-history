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

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps) {
  const pre = requireAuth(app);

  app.get("/api/v1/admin/cameras", { preHandler: pre }, async (req) => {
    const cameras = await deps.repos.listCameras(req.user!.tenantId);
    return { cameras };
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
        ["name", "feedType", "feedUrl", "intervalMinutes", "activeFrom", "activeTo", "timezone", "enabled", "theme"].includes(k),
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
}