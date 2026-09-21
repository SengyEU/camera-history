import { describe, expect, it } from "vitest";
import { keyFor } from "../src/storage.js";

describe("keyFor", () => {
  it("builds org/{slug}/{camera}/{YYYY-MM-DD}/{HHMMSS}.jpg (UTC)", () => {
    const ts = new Date("2026-09-18T09:05:03Z");
    expect(keyFor("acme", "cam-1", ts)).toBe("org/acme/cam-1/2026-09-18/090503.jpg");
  });
});