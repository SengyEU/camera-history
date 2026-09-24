import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.js";

describe("health route", () => {
  it("returns ok on GET /api/v1/health", async () => {
    const { app } = makeApp();
    const res = await app.inject({ url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await (app as { close: () => Promise<void> }).close();
  });
});