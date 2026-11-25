import { describe, expect, it } from "vitest";
import { defineFakeStripeGateway, makeApp, testConfig } from "./helpers.js";

describe("auth", () => {
  it("registers tenant and sets cookies", async () => {
    const { app, repos } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
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
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME2", slug: "acme", email: "b@acme.cz", password: "password123" },
    });
    expect(second.statusCode).toBe(409);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects a duplicate email without creating another tenant", async () => {
    const { app, repos } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Other", slug: "other", email: "A@ACME.CZ", password: "password123" },
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
      payload: { name: "ACME", slug: "acme", email: "not-an-email", password: "password123" },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "  ACME  ", slug: "  acme  ", email: "  Owner@ACME.CZ ", password: "password123" },
    });
    expect(created.statusCode).toBe(201);
    expect(repos.db.tenants[0]!.name).toBe("ACME");
    expect(repos.db.tenants[0]!.slug).toBe("acme");
    expect(repos.db.users[0]!.email).toBe("owner@acme.cz");

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "OWNER@acme.cz", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    await (app as { close: () => Promise<void> }).close();
  });

  it("enforces name, slug and password limits", async () => {
    const { app } = makeApp();
    const base = { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" };
    for (const payload of [
      { ...base, name: "x".repeat(81) },
      { ...base, slug: "x".repeat(41) },
      { ...base, password: "short" },
      { ...base, password: "x".repeat(129) },
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
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
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

  it("login returns cookies, logout clears them", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "password123" },
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
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
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
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
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
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
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
        password: "password123",
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
        password: "password123",
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
        password: "password123",
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
        password: "password123",
        pilotCode: "wrong",
      },
    });
    expect(res.statusCode).toBe(403);
    await (app as { close: () => Promise<void> }).close();
  });
});