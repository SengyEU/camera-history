import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { errorHandler } from "./plugins/errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerPublicRoutes } from "./routes/public.js";

export interface AppDeps {
  cfg: AppConfig;
  repos: Repos;
  storage: ObjectStorage;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie);
  app.register(jwt, { secret: deps.cfg.jwt.secret });
  app.register(rateLimit, { global: false, max: 300, timeWindow: "1 minute" });

  app.setErrorHandler(errorHandler);

  app.register(registerAuthRoutes, deps);
  app.register(registerAdminRoutes, deps);
  app.register(registerPublicRoutes, deps);

  return app;
}