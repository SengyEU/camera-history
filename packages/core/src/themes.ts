export const THEMES = ["light", "dark", "forest", "midnight", "custom"] as const;

export type Theme = (typeof THEMES)[number];

export const PRESET_THEMES = ["light", "dark", "forest", "midnight"] as const;

export type PresetTheme = (typeof PRESET_THEMES)[number];

export function isValidTheme(theme: string): theme is Theme {
  return (THEMES as readonly string[]).includes(theme);
}

export const THEME_COLOR_KEYS = [
  "bg",
  "surface",
  "ink",
  "muted",
  "line",
  "accent",
  "onAccent",
  "pine",
  "onPine",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export type ThemeColors = Record<ThemeColorKey, string>;

const HEX = /^#[0-9a-f]{6}$/i;

export function isValidThemeColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function normalizeThemeColors(input: unknown): ThemeColors | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const colors = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    if (!isValidThemeColor(source[key])) return null;
    colors[key] = String(source[key]).toLowerCase();
  }
  return colors;
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  bg: "#f8fafb",
  surface: "#ffffff",
  ink: "#101828",
  muted: "#5b6b7c",
  line: "#e3e9ef",
  accent: "#0e7490",
  onAccent: "#ffffff",
  pine: "#1e7d4e",
  onPine: "#ffffff",
};
