import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.js";

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
});