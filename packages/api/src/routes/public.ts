import type { FastifyPluginAsync } from "fastify";
import { dayRangeUtc, gatedRange, retentionCutoff, rfc7807 } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";

export type PublicRouteDeps = {
  cfg: import("@ch/core").AppConfig;
  repos: Repos;
  storage: ObjectStorage;
};

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const fileRe = /^\d{6}\.jpg$/;
const notFound = () => rfc7807(404, "not_found", "Camera not found");

export const registerPublicRoutes: FastifyPluginAsync<PublicRouteDeps> = async (app, deps) => {
  const { cfg, repos, storage } = deps;
  const baseUrl = cfg.api.publicBaseUrl.replace(/\/+$/, "");

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    "/v1/cameras/:id/images",
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

      const range = dayRangeUtc(date);
      const cutoff = retentionCutoff(cam.retentionMonths);
      const gated = gatedRange(range.start, range.end, cutoff);
      const data =
        gated.end <= gated.start
          ? []
          : await repos.imagesForCameraDay(cam.id, gated.start, gated.end);

      return {
        cameraId: cam.id,
        name: cam.name,
        date,
        images: data.map((img) => ({
          id: img.id,
          timestamp: img.timestamp,
          url: `${baseUrl}/v1/cameras/${cam.id}/${date}/${img.storageKey.split("/").pop()}`,
        })),
      };
    },
  );

  app.get<{ Params: { id: string; date: string; file: string } }>(
    "/v1/cameras/:id/:date/:file",
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

      const range = dayRangeUtc(date);
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
      return reply.type("image/jpeg").send(bytes);
    },
  );
};