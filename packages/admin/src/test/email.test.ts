import { describe, expect, it } from "vitest";
import { shortEmail } from "../email";

describe("shortEmail", () => {
  it("keeps short addresses unchanged", () => {
    expect(shortEmail("owner@alpine.example")).toBe("owner@alpine.example");
  });

  it("keeps the domain when the local part is long", () => {
    const result = shortEmail("verylonglocalpartname@example.com", 30);
    expect(result.endsWith("@example.com")).toBe(true);
    expect(result).toContain("…");
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("keeps the start and end when the domain is long", () => {
    const result = shortEmail("owner@very-long-subdomain.example.com", 26);
    expect(result).toContain("…");
    expect(result).toMatch(/^owner@/);
    expect(result.endsWith(".com")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(26);
  });

  it("handles values without an @", () => {
    const result = shortEmail("a-very-long-account-name", 12);
    expect(result).toContain("…");
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it("handles an empty value", () => {
    expect(shortEmail("")).toBe("");
  });
});
