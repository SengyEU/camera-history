import { describe, expect, it } from "vitest";
import { THEMES, isValidTheme } from "../src/themes.js";

describe("themes", () => {
  it("exposes the four approved presets", () => {
    expect(THEMES).toEqual(["light", "dark", "forest", "midnight"]);
  });

  it("accepts valid theme names", () => {
    expect(isValidTheme("light")).toBe(true);
    expect(isValidTheme("midnight")).toBe(true);
  });

  it("rejects unknown theme names", () => {
    expect(isValidTheme("custom")).toBe(false);
    expect(isValidTheme("")).toBe(false);
  });
});