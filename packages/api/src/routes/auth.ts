import argon2 from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { HttpError, isPackageCode } from "@ch/core";
import type { AppDeps } from "../app.js";
import { clearCookies, getRefreshToken, requireAuth, setCookies } from "../plugins/auth.js";

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTER_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };
const PASSWORD_RATE_LIMIT = { max: 5, timeWindow: "1 minute" };
const VERIFY_RATE_LIMIT = { max: 10, timeWindow: "10 minutes" };
const RESEND_RATE_LIMIT = { max: 3, timeWindow: "10 minutes" };
const FORGOT_RATE_LIMIT = { max: 3, timeWindow: "10 minutes" };
const RESET_RATE_LIMIT = { max: 10, timeWindow: "10 minutes" };
const NAME_MAX = 80;
const SLUG_MAX = 40;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORT_EMAIL = "support@camera-history.com";
const TOKEN_MAX = 200;

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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function companyName(name: string): string {
  return name.replace(/\s+/g, " ").trim() || "your team";
}

function verificationEmail(name: string, link: string, ttlHours: number): { subject: string; text: string } {
  const company = companyName(name);
  return {
    subject: "Verify your Camera History email",
    text: [
      `Hi ${company},`,
      "",
      "Confirm your email address to activate your Camera History workspace.",
      "",
      link,
      "",
      `This link expires in ${ttlHours} hours and can be used once.`,
      "If you did not create a Camera History account, you can ignore this email.",
      "",
      "Camera History",
      SUPPORT_EMAIL,
    ].join("\n"),
  };
}

function welcomeEmail(name: string, signInUrl: string): { subject: string; text: string } {
  const company = companyName(name);
  return {
    subject: `Welcome to Camera History, ${company}`,
    text: [
      `Welcome to Camera History, ${company}.`,
      "",
      "Your email is verified and your workspace is ready.",
      "",
      "Sign in to add your first camera and choose how often it is archived:",
      signInUrl,
      "",
      `If you need help, write to ${SUPPORT_EMAIL}.`,
      "",
      "Camera History",
    ].join("\n"),
  };
}

function passwordResetEmail(name: string, link: string, ttlMinutes: number): { subject: string; text: string } {
  const company = companyName(name);
  return {
    subject: "Reset your Camera History password",
    text: [
      `Hi ${company},`,
      "",
      "We received a request to reset the password for your Camera History account.",
      "",
      link,
      "",
      `This link expires in ${ttlMinutes} minutes and can be used once.`,
      "If you did not request this, you can ignore this email. Your password stays the same.",
      "",
      "Camera History",
      SUPPORT_EMAIL,
    ].join("\n"),
  };
}

function adminUrl(deps: AppDeps, hashPath: string): string {
  return `${deps.cfg.api.publicBaseUrl.replace(/\/+$/, "")}/admin/${hashPath}`;
}

async function sendVerification(
  app: FastifyInstance,
  deps: AppDeps,
  user: { id: string; email: string },
  name: string,
): Promise<boolean> {
  const token = randomBytes(32).toString("base64url");
  const ttlHours = deps.cfg.auth.verificationTtlHours;
  await deps.repos.deleteEmailVerificationTokensForUser(user.id);
  await deps.repos.createEmailVerificationToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  });

  if (!deps.mailer) {
    app.log.error({ userId: user.id }, "verification email not sent: mailer is not configured");
    return false;
  }

  const message = verificationEmail(
    name,
    adminUrl(deps, `#/verify-email?token=${encodeURIComponent(token)}`),
    ttlHours,
  );
  try {
    await deps.mailer.send({
      to: user.email,
      subject: message.subject,
      text: message.text,
      replyTo: SUPPORT_EMAIL,
    });
    return true;
  } catch (err) {
    app.log.error({ err, userId: user.id }, "verification email failed");
    return false;
  }
}

async function sendWelcome(
  app: FastifyInstance,
  deps: AppDeps,
  user: { id: string; email: string; tenantId: string },
): Promise<void> {
  if (!deps.mailer) {
    app.log.error({ userId: user.id }, "welcome email not sent: mailer is not configured");
    return;
  }
  const tenant = await deps.repos.getTenantById(user.tenantId);
  const message = welcomeEmail(tenant?.name ?? "", adminUrl(deps, ""));
  try {
    await deps.mailer.send({
      to: user.email,
      subject: message.subject,
      text: message.text,
      replyTo: SUPPORT_EMAIL,
    });
    await deps.repos.markWelcomeSent(user.id, new Date());
  } catch (err) {
    app.log.error({ err, userId: user.id }, "welcome email failed");
  }
}

async function sendPasswordReset(
  app: FastifyInstance,
  deps: AppDeps,
  user: { id: string; email: string },
  name: string,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ttlMinutes = deps.cfg.auth.passwordResetTtlMinutes;
  await deps.repos.deletePasswordResetTokensForUser(user.id);
  await deps.repos.createPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
  });

  if (!deps.mailer) {
    app.log.error({ userId: user.id }, "password reset email not sent: mailer is not configured");
    return;
  }

  const message = passwordResetEmail(
    name,
    adminUrl(deps, `#/reset-password?token=${encodeURIComponent(token)}`),
    ttlMinutes,
  );
  try {
    await deps.mailer.send({
      to: user.email,
      subject: message.subject,
      text: message.text,
      replyTo: SUPPORT_EMAIL,
    });
  } catch (err) {
    app.log.error({ err, userId: user.id }, "password reset email failed");
  }
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

      if (!deps.cfg.auth.requireEmailVerification) {
        await deps.repos.markEmailVerified(user.id, new Date());
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
      }

      const emailSent = await sendVerification(app, deps, user, tenant.name);
      return reply.code(201).send({
        status: "verification_sent",
        email: user.email,
        emailSent,
      });
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
      if (deps.cfg.auth.requireEmailVerification && !user.emailVerifiedAt) {
        throw new HttpError(403, "email_not_verified", "email is not verified");
      }

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
    "/api/v1/auth/verify-email",
    { config: { rateLimit: VERIFY_RATE_LIMIT } },
    async (req) => {
      const body = req.body as { token?: string };
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!token || token.length > TOKEN_MAX) {
        throw new HttpError(400, "bad_request", "verification token is required");
      }

      const now = new Date();
      const consumed = await deps.repos.consumeEmailVerificationToken(hashToken(token), now);
      if (!consumed) {
        throw new HttpError(400, "invalid_token", "verification link is invalid or expired");
      }

      const user = await deps.repos.markEmailVerified(consumed.userId, now);
      if (!user) {
        throw new HttpError(400, "invalid_token", "verification link is invalid or expired");
      }
      if (!user.welcomeSentAt) {
        await sendWelcome(app, deps, user);
      }
      return { status: "verified", email: user.email };
    },
  );

  app.post(
    "/api/v1/auth/resend-verification",
    { config: { rateLimit: RESEND_RATE_LIMIT } },
    async (req, reply) => {
      const body = req.body as { email?: string };
      const email = text(body.email).toLowerCase();
      if (!VALID_EMAIL.test(email)) {
        throw new HttpError(400, "bad_request", "invalid email");
      }

      const user = await deps.repos.getUserByEmail(email);
      if (user && !user.emailVerifiedAt) {
        const tenant = await deps.repos.getTenantById(user.tenantId);
        await sendVerification(app, deps, user, tenant?.name ?? "");
      }
      return reply.code(202).send({ status: "ok" });
    },
  );

  app.post(
    "/api/v1/auth/forgot-password",
    { config: { rateLimit: FORGOT_RATE_LIMIT } },
    async (req, reply) => {
      const body = req.body as { email?: string };
      const email = text(body.email).toLowerCase();
      if (!VALID_EMAIL.test(email)) {
        throw new HttpError(400, "bad_request", "invalid email");
      }

      const user = await deps.repos.getUserByEmail(email);
      if (user) {
        const tenant = await deps.repos.getTenantById(user.tenantId);
        await sendPasswordReset(app, deps, user, tenant?.name ?? "");
      }
      return reply.code(202).send({ status: "ok" });
    },
  );

  app.post(
    "/api/v1/auth/reset-password",
    { config: { rateLimit: RESET_RATE_LIMIT } },
    async (req, reply) => {
      const body = req.body as { token?: string; newPassword?: string };
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!token || token.length > TOKEN_MAX) {
        throw new HttpError(400, "bad_request", "reset token is required");
      }
      const passwordError = passwordProblem(newPassword);
      if (passwordError) throw new HttpError(400, "bad_request", passwordError);

      const now = new Date();
      const consumed = await deps.repos.consumePasswordResetToken(hashToken(token), now);
      if (!consumed) {
        throw new HttpError(400, "invalid_token", "reset link is invalid or expired");
      }
      const user = await deps.repos.getUserById(consumed.userId);
      if (!user) {
        throw new HttpError(400, "invalid_token", "reset link is invalid or expired");
      }

      await deps.repos.updateUserPassword(user.id, await argon2.hash(newPassword));
      await deps.repos.deletePasswordResetTokensForUser(user.id);
      clearCookies(reply);
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

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const token = getRefreshToken(req);
    if (!token) throw new HttpError(401, "unauthorized", "missing refresh token");
    let payload: { tenantId: string; email: string; role: string; kind: string; iat?: number };
    try {
      payload = app.jwt.verify<{
        tenantId: string;
        email: string;
        role: string;
        kind: string;
        iat?: number;
      }>(token);
    } catch {
      throw new HttpError(401, "unauthorized", "invalid refresh token");
    }
    if (payload.kind !== "refresh") throw new HttpError(401, "unauthorized", "invalid refresh token");

    const user = await deps.repos.getUserByEmail(payload.email);
    if (!user || (deps.cfg.auth.requireEmailVerification && !user.emailVerifiedAt)) {
      clearCookies(reply);
      throw new HttpError(401, "unauthorized", "invalid refresh token");
    }
    if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > (payload.iat ?? 0)) {
      clearCookies(reply);
      throw new HttpError(401, "unauthorized", "session expired");
    }

    const access = app.jwt.sign(
      { tenantId: user.tenantId, email: user.email, role: user.role, kind: "access" },
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
