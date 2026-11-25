import argon2 from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { HttpError, isPackageCode } from "@ch/core";
import type { AppDeps } from "../app.js";
import { clearCookies, getRefreshToken, requireAuth, setCookies } from "../plugins/auth.js";

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTER_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };
const PASSWORD_RATE_LIMIT = { max: 5, timeWindow: "1 minute" };
const NAME_MAX = 80;
const SLUG_MAX = 40;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`;
  }
  if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "password must include an uppercase letter and a number";
  }
  return null;
}

function uniqueViolation(err: unknown): "email" | "slug" | null {
  if ((err as { code?: string }).code !== "23505") return null;
  const constraint = String((err as { constraint?: string }).constraint ?? "");
  if (constraint.includes("email")) return "email";
  if (constraint.includes("slug")) return "slug";
  return null;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    "/api/v1/auth/register",
    { config: { rateLimit: REGISTER_RATE_LIMIT } },
    async (req, reply) => {
      const body = req.body as {
        name?: string;
        slug?: string;
        email?: string;
        password?: string;
        packageCode?: string;
        pilotCode?: string;
      };
      const name = text(body.name);
      const slug = text(body.slug);
      const email = text(body.email).toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";

      if (!name || !slug || !email || !password) {
        throw new HttpError(400, "bad_request", "name, slug, email and password are required");
      }
      if (name.length > NAME_MAX) {
        throw new HttpError(400, "bad_request", `name must be ${NAME_MAX} characters or fewer`);
      }
      if (slug.length > SLUG_MAX) {
        throw new HttpError(400, "bad_request", `slug must be ${SLUG_MAX} characters or fewer`);
      }
      if (!VALID_SLUG.test(slug)) {
        throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
      }
      if (!VALID_EMAIL.test(email)) {
        throw new HttpError(400, "bad_request", "invalid email");
      }
      const passwordError = passwordProblem(password);
      if (passwordError) throw new HttpError(400, "bad_request", passwordError);

      const packageCode = body.packageCode;
      if (packageCode !== undefined && !isPackageCode(packageCode)) {
        throw new HttpError(400, "bad_request", "unknown package");
      }

      const pilotRequested = body.pilotCode !== undefined;
      if (pilotRequested) {
        if (!deps.cfg.pilot.inviteCode || body.pilotCode !== deps.cfg.pilot.inviteCode) {
          throw new HttpError(403, "invalid_pilot_code", "pilot invite code is not valid");
        }
      }

      if (await deps.repos.getUserByEmail(email)) {
        throw new HttpError(409, "conflict", "email already registered");
      }
      if (await deps.repos.getTenantBySlug(slug)) {
        throw new HttpError(409, "conflict", "tenant slug already taken");
      }

      const passwordHash = await argon2.hash(password);
      let created;
      try {
        created = await deps.repos.createTenantWithUser({
          tenant: {
            name,
            slug,
            packageCode,
            isPilot: pilotRequested,
            pilotUntil: pilotRequested
              ? new Date(Date.now() + deps.cfg.pilot.durationDays * DAY_MS)
              : null,
          },
          user: { email, passwordHash, role: "owner" },
        });
      } catch (err) {
        const conflict = uniqueViolation(err);
        if (conflict === "email") {
          throw new HttpError(409, "conflict", "email already registered");
        }
        if (conflict === "slug") {
          throw new HttpError(409, "conflict", "tenant slug already taken");
        }
        throw err;
      }

      const { tenant, user } = created;
      const access = app.jwt.sign(
        { tenantId: tenant.id, email: user.email, role: user.role, kind: "access" },
        { expiresIn: deps.cfg.jwt.accessTtlSeconds },
      );
      const refresh = app.jwt.sign(
        { tenantId: tenant.id, email: user.email, role: user.role, kind: "refresh" },
        { expiresIn: deps.cfg.jwt.refreshTtlSeconds },
      );
      setCookies(reply, deps.cfg, access, refresh);
      return reply.code(201).send({ status: "created", tenantId: tenant.id });
    },
  );

  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (req, reply) => {
      const body = req.body as { email?: string; password?: string };
      const email = text(body.email).toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) {
        throw new HttpError(400, "bad_request", "email and password are required");
      }
      const user = await deps.repos.getUserByEmail(email);
      if (!user) throw new HttpError(401, "unauthorized", "invalid credentials");
      const ok = await argon2.verify(user.passwordHash, password);
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
    },
  );

  app.post(
    "/api/v1/auth/password",
    { preHandler: requireAuth(app), config: { rateLimit: PASSWORD_RATE_LIMIT } },
    async (req, reply) => {
      const body = req.body as { currentPassword?: string; newPassword?: string };
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!currentPassword || !newPassword) {
        throw new HttpError(400, "bad_request", "currentPassword and newPassword are required");
      }
      const user = await deps.repos.getUserByEmail(req.user!.email);
      if (!user) throw new HttpError(401, "unauthorized", "unauthorized");
      const ok = await argon2.verify(user.passwordHash, currentPassword);
      if (!ok) throw new HttpError(400, "bad_request", "current password is incorrect");
      const passwordError = passwordProblem(newPassword);
      if (passwordError) throw new HttpError(400, "bad_request", passwordError);
      if (currentPassword === newPassword) {
        throw new HttpError(400, "bad_request", "new password must be different");
      }
      await deps.repos.updateUserPassword(user.id, await argon2.hash(newPassword));
      return { status: "ok" };
    },
  );

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
