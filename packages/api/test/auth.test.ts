import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeRepos } from "@ch/db";
import type { AppConfig } from "@ch/core";
import { defineFakeStripeGateway, makeApp, testConfig } from "./helpers.js";
import type { MailMessage, Mailer } from "../src/mailer.js";

describe("auth", () => {
  it("registers tenant and sets cookies", async () => {
    const { app, repos } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(repos.db.tenants).toHaveLength(1);
    expect(repos.db.users).toHaveLength(1);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects duplicate slug", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME2", slug: "acme", email: "b@acme.cz", password: "Password123" },
    });
    expect(second.statusCode).toBe(409);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects a duplicate email without creating another tenant", async () => {
    const { app, repos } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Other", slug: "other", email: "A@ACME.CZ", password: "Password123" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().detail).toBe("email already registered");
    expect(repos.db.tenants).toHaveLength(1);
    expect(repos.db.users).toHaveLength(1);
    await (app as { close: () => Promise<void> }).close();
  });

  it("normalizes email and rejects invalid addresses", async () => {
    const { app, repos } = makeApp();
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "not-an-email", password: "Password123" },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "  ACME  ", slug: "  acme  ", email: "  Owner@ACME.CZ ", password: "Password123" },
    });
    expect(created.statusCode).toBe(201);
    expect(repos.db.tenants[0]!.name).toBe("ACME");
    expect(repos.db.tenants[0]!.slug).toBe("acme");
    expect(repos.db.users[0]!.email).toBe("owner@acme.cz");

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "OWNER@acme.cz", password: "Password123" },
    });
    expect(login.statusCode).toBe(200);
    await (app as { close: () => Promise<void> }).close();
  });

  it("enforces name, slug and password limits", async () => {
    const { app } = makeApp();
    const base = { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" };
    for (const payload of [
      { ...base, name: "x".repeat(81) },
      { ...base, slug: "x".repeat(41) },
      { ...base, password: "short" },
      { ...base, password: "x".repeat(129) },
      { ...base, password: "lowercase123" },
      { ...base, password: "NoNumbers" },
    ]) {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload });
      expect(res.statusCode).toBe(400);
    }
    await (app as { close: () => Promise<void> }).close();
  });

  it("rate limits repeated login attempts", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "a@acme.cz", password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
    }
    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "wrong" },
    });
    expect(limited.statusCode).toBe(429);
    await (app as { close: () => Promise<void> }).close();
  });

  it("changes the password for the signed-in user", async () => {
    const { app } = makeApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    const cookie = created.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: { cookie },
      payload: { currentPassword: "Password123", newPassword: "NewPassword456" },
    });
    expect(changed.statusCode).toBe(200);

    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "Password123" },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "NewPassword456" },
    });
    expect(newLogin.statusCode).toBe(200);
    await (app as { close: () => Promise<void> }).close();
  });

  it("validates the current and new password when changing it", async () => {
    const { app } = makeApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    const cookie = created.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const wrongCurrent = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: { cookie },
      payload: { currentPassword: "WrongPass123", newPassword: "NewPassword456" },
    });
    expect(wrongCurrent.statusCode).toBe(400);
    expect(wrongCurrent.json().detail).toBe("current password is incorrect");

    const weak = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: { cookie },
      payload: { currentPassword: "Password123", newPassword: "lowercase1" },
    });
    expect(weak.statusCode).toBe(400);

    const same = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: { cookie },
      payload: { currentPassword: "Password123", newPassword: "Password123" },
    });
    expect(same.statusCode).toBe(400);

    const anonymous = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      payload: { currentPassword: "Password123", newPassword: "NewPassword456" },
    });
    expect(anonymous.statusCode).toBe(401);
    await (app as { close: () => Promise<void> }).close();
  });

  it("login returns cookies, logout clears them", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "Password123" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeDefined();
    const cookies = (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!);
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: cookies.join("; ") },
    });
    expect(logout.statusCode).toBe(200);
    await (app as { close: () => Promise<void> }).close();
  });

  it("login rejects wrong password", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "wrong" },
    });
    expect(login.statusCode).toBe(401);
    await (app as { close: () => Promise<void> }).close();
  });

  it("does not start billing at registration when stripe is enabled", async () => {
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12" } } },
      stripe: defineFakeStripeGateway(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().billing).toBeUndefined();
    await (app as { close: () => Promise<void> }).close();
  });

  it("omits billing block when stripe is off", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "Password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().billing).toBeUndefined();
    await (app as { close: () => Promise<void> }).close();
  });

  it("preselects a package at registration", async () => {
    const { app, repos } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "ACME",
        slug: "acme",
        email: "a@acme.cz",
        password: "Password123",
        packageCode: "plus",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(repos.db.tenants[0]!.packageCode).toBe("plus");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects an unknown package at registration", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "ACME",
        slug: "acme",
        email: "a@acme.cz",
        password: "Password123",
        packageCode: "enterprise",
      },
    });
    expect(res.statusCode).toBe(400);
    await (app as { close: () => Promise<void> }).close();
  });

  it("creates a 90-day pilot from a valid invite code", async () => {
    const { app, repos } = makeApp({
      cfg: { ...testConfig, pilot: { inviteCode: "pilot-secret", durationDays: 90 } },
    });
    const before = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Pilot Resort",
        slug: "pilot-resort",
        email: "pilot@example.com",
        password: "Password123",
        pilotCode: "pilot-secret",
      },
    });
    expect(res.statusCode).toBe(201);
    const tenant = repos.db.tenants[0]!;
    expect(tenant.isPilot).toBe(true);
    expect(tenant.pilotUntil).not.toBeNull();
    const days = (tenant.pilotUntil!.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects an invalid pilot invite code", async () => {
    const { app } = makeApp({
      cfg: { ...testConfig, pilot: { inviteCode: "pilot-secret", durationDays: 90 } },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "ACME",
        slug: "acme",
        email: "a@acme.cz",
        password: "Password123",
        pilotCode: "wrong",
      },
    });
    expect(res.statusCode).toBe(403);
    await (app as { close: () => Promise<void> }).close();
  });
});

const verifyConfig: AppConfig = {
  ...testConfig,
  auth: { requireEmailVerification: true, verificationTtlHours: 24, passwordResetTtlMinutes: 60 },
};

const account = {
  name: "Alpine Resort",
  slug: "alpine-resort",
  email: "owner@alpine.dev",
  password: "Supersecret1",
};

function makeMailer(options: { fail?: boolean } = {}) {
  const sent: MailMessage[] = [];
  let fail = options.fail ?? false;
  const mailer: Mailer = {
    async send(message) {
      if (fail) throw new Error("smtp unavailable");
      sent.push(message);
    },
  };
  return {
    mailer,
    sent,
    setFail(value: boolean) {
      fail = value;
    },
  };
}

function tokenFrom(message: MailMessage | undefined): string {
  const match = /#\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "");
  if (!match) throw new Error("verification token missing from email");
  return match[1]!;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("auth email verification", () => {
  it("creates the account without a session and emails a verification link", async () => {
    const { mailer, sent } = makeMailer();
    const { app, repos } = makeApp({ cfg: verifyConfig, mailer });

    const res = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      status: "verification_sent",
      email: account.email,
      emailSent: true,
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: account.email, replyTo: "support@camera-history.com" });
    expect(sent[0]!.subject).toContain("Confirm");
    expect(sent[0]!.text).toContain("http://localhost:8080/admin/#/verify-email?token=");
    expect(sent[0]!.html).toContain("<!doctype html>");
    expect(sent[0]!.html).toContain("Verify email");

    const user = await repos.getUserByEmail(account.email);
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.welcomeSentAt).toBeNull();
    await app.close();
  });

  it("blocks login until the email is verified", async () => {
    const { mailer } = makeMailer();
    const { app } = makeApp({ cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: account.email, password: account.password },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ title: "email_not_verified" });
    expect(res.headers["set-cookie"]).toBeUndefined();
    await app.close();
  });

  it("verifies the token, sends one welcome email, then allows login", async () => {
    const { mailer, sent } = makeMailer();
    const { app, repos } = makeApp({ cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    const token = tokenFrom(sent[0]);

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });

    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toEqual({ status: "verified", email: account.email });
    expect(sent).toHaveLength(2);
    const welcome = sent[1]!;
    expect(welcome.to).toBe(account.email);
    expect(welcome.replyTo).toBe("support@camera-history.com");
    expect(welcome.subject).toContain("Alpine Resort");
    expect(welcome.text).toContain("Welcome to Camera History, Alpine Resort.");
    expect(welcome.text).toContain("support@camera-history.com");
    expect(welcome.text).not.toContain("marek@");
    expect(welcome.text.toLowerCase()).not.toContain("reply to this email");
    expect(welcome.html).toContain("Open your workspace");
    expect(welcome.html).not.toContain("marek@");

    const user = await repos.getUserByEmail(account.email);
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user?.welcomeSentAt).toBeInstanceOf(Date);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: account.email, password: account.password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeDefined();
    await app.close();
  });

  it("rejects a verification token after it has been used", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    const token = tokenFrom(sent[0]);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(sent).toHaveLength(2);
    await app.close();
  });

  it("rejects an expired token and lets the user request a new one", async () => {
    const repos = createFakeRepos();
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ repos, cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    const expired = tokenFrom(sent[0]);
    const row = repos.db.emailVerificationTokens.find((t) => t.tokenHash === hashToken(expired));
    expect(row).toBeDefined();
    row!.expiresAt = new Date(Date.now() - 1000);

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: expired },
    });
    expect(verify.statusCode).toBe(400);

    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: account.email },
    });
    expect(resend.statusCode).toBe(202);
    expect(sent).toHaveLength(2);

    const fresh = tokenFrom(sent[1]);
    const retry = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: fresh },
    });
    expect(retry.statusCode).toBe(200);
    await app.close();
  });

  it("invalidates the previous link when a new one is requested", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    const first = tokenFrom(sent[0]);

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: account.email },
    });
    const second = tokenFrom(sent[1]);
    expect(second).not.toBe(first);

    const oldLink = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: first },
    });
    expect(oldLink.statusCode).toBe(400);

    const newLink = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: second },
    });
    expect(newLink.statusCode).toBe(200);
    await app.close();
  });

  it("returns 202 for an unknown address without sending anything", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ cfg: verifyConfig, mailer });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: "nobody@example.com" },
    });

    expect(res.statusCode).toBe(202);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("keeps the account and reports failure when SMTP is down", async () => {
    const { mailer, sent, setFail } = makeMailer({ fail: true });
    const { app, repos } = makeApp({ cfg: verifyConfig, mailer });

    const register = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({ status: "verification_sent", emailSent: false });
    expect(await repos.getUserByEmail(account.email)).not.toBeNull();
    expect(sent).toHaveLength(0);

    setFail(false);
    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/resend-verification",
      payload: { email: account.email },
    });
    expect(resend.statusCode).toBe(202);
    expect(sent).toHaveLength(1);

    const verify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: tokenFrom(sent[0]) },
    });
    expect(verify.statusCode).toBe(200);
    await app.close();
  });

  it("does not send the welcome email twice", async () => {
    const repos = createFakeRepos();
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ repos, cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    const first = tokenFrom(sent[0]);
    await app.inject({ method: "POST", url: "/api/v1/auth/verify-email", payload: { token: first } });
    expect(sent.filter((m) => m.subject.startsWith("Welcome"))).toHaveLength(1);

    const user = await repos.getUserByEmail(account.email);
    const extra = randomBytes(32).toString("base64url");
    await repos.createEmailVerificationToken({
      userId: user!.id,
      tokenHash: hashToken(extra),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token: extra },
    });

    expect(second.statusCode).toBe(200);
    expect(sent.filter((m) => m.subject.startsWith("Welcome"))).toHaveLength(1);
    await app.close();
  });

  it("keeps the legacy immediate session when verification is disabled", async () => {
    const { mailer, sent } = makeMailer();
    const { app, repos } = makeApp({ cfg: testConfig, mailer });

    const res = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "created" });
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(sent).toHaveLength(0);
    expect((await repos.getUserByEmail(account.email))?.emailVerifiedAt).toBeInstanceOf(Date);
    await app.close();
  });
});

function resetTokenFrom(message: MailMessage | undefined): string {
  const match = /#\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "");
  if (!match) throw new Error("password reset token missing from email");
  return match[1]!;
}

describe("password reset", () => {
  it("emails a single-use link and changes the password", async () => {
    const { mailer, sent } = makeMailer();
    const { app, repos } = makeApp({ cfg: testConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });

    const forgot = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: account.email },
    });
    expect(forgot.statusCode).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: account.email, replyTo: "support@camera-history.com" });
    expect(sent[0]!.subject).toContain("Reset");
    expect(sent[0]!.text).toContain("http://localhost:8080/admin/#/reset-password?token=");
    expect(sent[0]!.html).toContain("Choose a new password");

    const token = resetTokenFrom(sent[0]);
    const stored = repos.db.passwordResetTokens[0]!;
    expect(stored.tokenHash).not.toBe(token);

    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "BrandNew456" },
    });
    expect(reset.statusCode).toBe(200);

    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: account.email, password: account.password },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: account.email, password: "BrandNew456" },
    });
    expect(newLogin.statusCode).toBe(200);
    await app.close();
  });

  it("returns 202 for an unknown address without sending anything", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ cfg: testConfig, mailer });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "nobody@example.com" },
    });

    expect(res.statusCode).toBe(202);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("rejects an expired or reused link", async () => {
    const repos = createFakeRepos();
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ repos, cfg: testConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: account.email },
    });
    const token = resetTokenFrom(sent[0]);
    repos.db.passwordResetTokens[0]!.expiresAt = new Date(Date.now() - 1000);

    const expired = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "BrandNew456" },
    });
    expect(expired.statusCode).toBe(400);

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: account.email },
    });
    const fresh = resetTokenFrom(sent[1]);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: fresh, newPassword: "BrandNew456" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token: fresh, newPassword: "Another789" },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    await app.close();
  });

  it("keeps the link usable when the new password is too weak", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ cfg: testConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: account.email },
    });
    const token = resetTokenFrom(sent[0]);

    const weak = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "lowercase1" },
    });
    expect(weak.statusCode).toBe(400);

    const retry = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "BrandNew456" },
    });
    expect(retry.statusCode).toBe(200);
    await app.close();
  });

  it("does not bypass email verification", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ cfg: verifyConfig, mailer });
    await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: account.email },
    });
    const token = resetTokenFrom(sent[1]);

    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "BrandNew456" },
    });
    expect(reset.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: account.email, password: "BrandNew456" },
    });
    expect(login.statusCode).toBe(403);
    await app.close();
  });

  it("invalidates refresh tokens issued before the password change", async () => {
    const repos = createFakeRepos();
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ repos, cfg: testConfig, mailer });
    const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: account });
    const refreshCookie = registered.cookies.find((c) => c.name === "ch_refresh");
    expect(refreshCookie).toBeDefined();

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: account.email },
    });
    const token = resetTokenFrom(sent[0]);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, newPassword: "BrandNew456" },
    });

    const user = repos.db.users.find((u) => u.email === account.email)!;
    user.passwordChangedAt = new Date(Date.now() + 5000);

    const refresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: `ch_refresh=${refreshCookie!.value}` },
    });

    expect(refresh.statusCode).toBe(401);
    expect(refresh.headers["set-cookie"]).toBeDefined();
    await app.close();
  });
});
