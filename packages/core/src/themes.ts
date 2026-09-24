export const THEMES = ["light", "dark", "forest", "midnight"] as const;

export type Theme = (typeof THEMES)[number];

export function isValidTheme(theme: string): theme is Theme {
  return (THEMES as readonly string[]).includes(theme);
}