import { describe, expect, it } from "vitest";
import { PRESET_THEMES, THEMES, isValidTheme, normalizeThemeColors } from "../src/themes.js";

describe("themes", () => {
  it("exposes the four approved presets plus custom", () => {
    expect(PRESET_THEMES).toEqual(["light", "dark", "forest", "midnight"]);
    expect(THEMES).toEqual(["light", "dark", "forest", "midnight", "custom"]);
  });

  it("accepts valid theme names", () => {
    expect(isValidTheme("light")).toBe(true);
    expect(isValidTheme("midnight")).toBe(true);
    expect(isValidTheme("custom")).toBe(true);
  });

  it("rejects unknown theme names", () => {
    expect(isValidTheme("neon")).toBe(false);
    expect(isValidTheme("")).toBe(false);
  });

  it("normalizes complete custom color sets only", () => {
    const colors = {
      bg: "#101010",
      surface: "#1a1a1a",
      ink: "#f5f5f5",
      muted: "#b0b0b0",
      line: "#333333",
      accent: "#7fbf9a",
      onAccent: "#101010",
      pine: "#3f9e6f",
      onPine: "#06231a",
    };
    expect(normalizeThemeColors(colors)).toEqual(colors);
    expect(normalizeThemeColors({ ...colors, bg: "red" })).toBeNull();
    expect(normalizeThemeColors({ ...colors, surface: undefined })).toBeNull();
  });
});