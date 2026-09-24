import argon2 from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { HttpError, priceIdForTier } from "@ch/core";
import type { AppDeps } from "../app.js";
import { clearCookies, getRefreshToken, setCookies } from "../plugins/auth.js";
import { adminBase } from "../stripe/gateway.js";

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/auth/register", async (req, reply) => {
    const body = req.body as { name?: string; slug?: string; email?: string; password?: string };
    if (!body.name || !body.slug || !body.email || !body.password) {
      throw new HttpError(400, "bad_request", "name, slug, email and password are required");
    }
    if (!VALID_SLUG.test(body.slug)) {
      throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
    }
    if (body.password.length < 8) throw new HttpError(400, "bad_request", "password must be at least 8 characters");

    const existing = await deps.repos.getTenantBySlug(body.slug);
    if (existing) throw new HttpError(409, "conflict", "tenant slug already taken");

    const passwordHash = await argon2.hash(body.password);
    const tenant = await deps.repos.createTenant({
      name: body.name,
      slug: body.slug,
      planMonths: deps.cfg.plan.defaultRetentionMonths,
    });
    const user = await deps.repos.createUser({
      tenantId: tenant.id,
      email: body.email.toLowerCase(),
      passwordHash,
      role: "owner",
    });

    let billing: { required: boolean; checkoutUrl?: string } | undefined;
    if (deps.stripe) {
      const customer = await deps.stripe.createCustomer({ tenantId: tenant.id });
      await deps.repos.setBillingState(tenant.id, { stripeCustomerId: customer.id });
      const priceId = priceIdForTier(deps.cfg.stripe.prices, deps.cfg.plan.defaultRetentionMonths);
      if (priceId) {
        const base = adminBase(deps.cfg);
        const session = await deps.stripe.createCheckoutSession({
          customer: customer.id,
          priceId,
          tenantId: tenant.id,
          planMonths: deps.cfg.plan.defaultRetentionMonths,
          successUrl: `${base}/#/billing?paid=1`,
          cancelUrl: `${base}/#/billing?pay=cancelled`,
        });
        billing = { required: true, checkoutUrl: session.url };
      } else {
        billing = { required: false };
      }
    }

    const access = app.jwt.sign(
      { tenantId: tenant.id, email: user.email, role: user.role, kind: "access" },
      { expiresIn: deps.cfg.jwt.accessTtlSeconds },
    );
    const refresh = app.jwt.sign(
      { tenantId: tenant.id, email: user.email, role: user.role, kind: "refresh" },
      { expiresIn: deps.cfg.jwt.refreshTtlSeconds },
    );
    setCookies(reply, deps.cfg, access, refresh);
    return reply.code(201).send({ status: "created", tenantId: tenant.id, ...(billing ? { billing } : {}) });
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const body = req.body as { email?: string; password?: string };
    if (!body.email || !body.password) throw new HttpError(400, "bad_request", "email and password are required");
    const user = await deps.repos.getUserByEmail(body.email.toLowerCase());
    if (!user) throw new HttpError(401, "unauthorized", "invalid credentials");
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) throw new HttpError(401, "unauthorized", "invalid credentials");

    const access = app.jwt.sign(
      { tenantId: user.tenantId, email: user.email, role: user.role, kind: "access" },
      { expiresIn: deps.cfg.jwt.accessTtlSeconds },
    );
    const refresh = app.jwt.sign(
      { tenantId: user.tenantId, email: user.email, role: user.role, kind: "refresh" },
      { expiresIn: deps.cfg.jwt.refreshTtlSeconds },
    );
    setCookies(reply, deps.cfg, access, refresh);
    return { status: "ok" };
  });

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const token = getRefreshToken(req);
    if (!token) throw new HttpError(401, "unauthorized", "missing refresh token");
    let payload: { tenantId: string; email: string; role: string; kind: string };
    try {
      payload = app.jwt.verify<{ tenantId: string; email: string; role: string; kind: string }>(token);
    } catch {
      throw new HttpError(401, "unauthorized", "invalid refresh token");
    }
    if (payload.kind !== "refresh") throw new HttpError(401, "unauthorized", "invalid refresh token");
    const access = app.jwt.sign(
      { tenantId: payload.tenantId, email: payload.email, role: payload.role, kind: "access" },
      { expiresIn: deps.cfg.jwt.accessTtlSeconds },
    );
    reply.setCookie("ch_access", access, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: deps.cfg.jwt.accessTtlSeconds,
    });
    return { status: "ok" };
  });

  app.post("/api/v1/auth/logout", async (_req, reply) => {
    clearCookies(reply);
    return { status: "ok" };
  });
}