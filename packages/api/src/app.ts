import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { errorHandler } from "./plugins/errors.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerContactRoutes } from "./routes/contact.js";
import { createSmtpMailer, type Mailer } from "./mailer.js";
import type { StripeGateway } from "./stripe/gateway.js";

export interface AppDeps {
  cfg: AppConfig;
  repos: Repos;
  storage: ObjectStorage;
  stripe: StripeGateway | null;
  mailer?: Mailer | null;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" },
  });

  app.register(cookie);
  app.register(jwt, { secret: deps.cfg.jwt.secret });
  app.register(rateLimit, { global: false, max: 300, timeWindow: "1 minute" });

  app.setErrorHandler(errorHandler);

  const depsWithMail = {
    ...deps,
    mailer: deps.mailer !== undefined ? deps.mailer : createSmtpMailer(deps.cfg),
  };

  app.register(registerHealthRoutes);
  app.register(registerAuthRoutes, depsWithMail);
  app.register(registerAdminRoutes, depsWithMail);
  app.register(registerBillingRoutes, depsWithMail);
  app.register(registerPublicRoutes, depsWithMail);
  app.register(registerContactRoutes, depsWithMail);

  return app;
}