import type { FastifyPluginAsync } from "fastify";
import {
  dayRangeInZone,
  gatedRange,
  localDateInZone,
  localHourInZone,
  retentionCutoff,
  rfc7807,
  sunTimes,
} from "@ch/core";
import type { SunTimes } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";

export type PublicRouteDeps = {
  cfg: import("@ch/core").AppConfig;
  repos: Repos;
  storage: ObjectStorage;
};

const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/;
const fileRe = /^\d{6}\.(webp|jpg)$/;
const notFound = () => rfc7807(404, "not_found", "Camera not found");

function dayRangeOrNull(date: string, timezone: string): { start: Date; end: Date } | null {
  const match = dateRe.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  try {
    return dayRangeInZone(date, timezone);
  } catch {
    return null;
  }
}

export const registerPublicRoutes: FastifyPluginAsync<PublicRouteDeps> = async (app, deps) => {
  const { cfg, repos, storage } = deps;
  const baseUrl = cfg.api.publicBaseUrl.replace(/\/+$/, "");

  app.get<{ Params: { id: string } }>("/api/v1/cameras/:id", async (req, reply) => {
    const cam = await repos.getPublicCamera(req.params.id);
    if (!cam) return reply.code(404).type("application/problem+json").send(notFound());
    return { camera: cam };
  });

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    "/api/v1/cameras/:id/images",
    async (req, reply) => {
      const cam = await repos.getPublicCamera(req.params.id);
      if (!cam) return reply.code(404).type("application/problem+json").send(notFound());

      const date = req.query.date;
      if (!date || !dateRe.test(date)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(rfc7807(400, "bad_request", "date must be YYYY-MM-DD"));
      }

      const range = dayRangeOrNull(date, cam.timezone);
      if (!range) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(rfc7807(400, "bad_request", "date must be a valid calendar date"));
      }

      const cutoff = retentionCutoff(cam.retentionMonths);
      const gated = gatedRange(range.start, range.end, cutoff);
      const data =
        gated.end <= gated.start
          ? []
          : await repos.imagesForCameraDay(cam.id, gated.start, gated.end);

      const coords =
        cam.latitude !== null && cam.longitude !== null
          ? { latitude: cam.latitude, longitude: cam.longitude }
          : null;
      const sunTimesCache = new Map<string, SunTimes | null>();

      const isDaylightAt = (ts: Date): boolean => {
        if (coords) {
          const localDate = localDateInZone(ts, cam.timezone);
          if (!sunTimesCache.has(localDate)) {
            sunTimesCache.set(
              localDate,
              sunTimes(localDate, coords.latitude, coords.longitude),
            );
          }
          const times = sunTimesCache.get(localDate) ?? null;
          if (times) return ts >= times.sunrise && ts <= times.sunset;
        }
        const h = localHourInZone(ts, cam.timezone);
        return h >= 6 && h < 20;
      };

      return {
        cameraId: cam.id,
        name: cam.name,
        date,
        images: data.map((img) => ({
          id: img.id,
          timestamp: img.timestamp,
          url: `${baseUrl}/api/v1/cameras/${cam.id}/${date}/${img.storageKey.split("/").pop()}`,
          isDaylight: isDaylightAt(img.timestamp),
        })),
      };
    },
  );

  app.get<{ Params: { id: string; date: string; file: string } }>(
    "/api/v1/cameras/:id/:date/:file",
    async (req, reply) => {
      const cam = await repos.getPublicCamera(req.params.id);
      if (!cam) return reply.code(404).type("application/problem+json").send(notFound());

      const { date, file } = req.params;
      if (!dateRe.test(date) || !fileRe.test(file)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(rfc7807(400, "bad_request", "invalid path"));
      }

      const range = dayRangeOrNull(date, cam.timezone);
      if (!range) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(rfc7807(400, "bad_request", "date must be a valid calendar date"));
      }

      const cutoff = retentionCutoff(cam.retentionMonths);
      const gated = gatedRange(range.start, range.end, cutoff);
      const data =
        gated.end <= gated.start
          ? []
          : await repos.imagesForCameraDay(cam.id, gated.start, gated.end);

      const image = data.find((i) => i.storageKey.split("/").pop() === file);
      if (!image) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(rfc7807(404, "not_found", "Image not found"));
      }

      const bytes = await storage.get(image.storageKey);
      const contentType = file.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return reply.type(contentType).send(bytes);
    },
  );

  app.get<{ Params: { tenantSlug: string; groupSlug: string } }>(
    "/api/v1/groups/:tenantSlug/:groupSlug",
    async (req, reply) => {
      const data = await repos.getGroupBySlug(req.params.tenantSlug, req.params.groupSlug);
      if (!data) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(rfc7807(404, "not_found", "Group not found"));
      }
      return data;
    },
  );

  app.get<{ Params: { id: string } }>("/api/v1/cameras/:id/latest", async (req, reply) => {
    const cam = await repos.getPublicCamera(req.params.id);
    if (!cam) return reply.code(404).type("application/problem+json").send(notFound());
    const latest = await repos.latestImageForCamera(req.params.id);
    if (!latest) return { date: null };
    const d = latest.timestamp;
    const date = localDateInZone(d, cam.timezone);
    return { date, timestamp: d.toISOString() };
  });
};