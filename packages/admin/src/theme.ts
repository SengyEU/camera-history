import type { ThemeColors } from "./api";

export const THEME_COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "ink", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "line", label: "Lines" },
  { key: "accent", label: "Accent" },
  { key: "onAccent", label: "Text on accent" },
  { key: "pine", label: "Pine / success" },
  { key: "onPine", label: "Text on pine" },
];

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

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4]
    .map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const CONTRAST_PAIRS: Array<{ label: string; foreground: keyof ThemeColors; background: keyof ThemeColors }> = [
  { label: "Text on background", foreground: "ink", background: "bg" },
  { label: "Text on surface", foreground: "ink", background: "surface" },
  { label: "Muted text on background", foreground: "muted", background: "bg" },
  { label: "Muted text on surface", foreground: "muted", background: "surface" },
  { label: "Text on accent", foreground: "onAccent", background: "accent" },
  { label: "Text on pine", foreground: "onPine", background: "pine" },
];

export function contrastWarnings(colors: ThemeColors): string[] {
  return CONTRAST_PAIRS.filter(({ foreground, background }) => contrastRatio(colors[foreground], colors[background]) < 4.5).map(
    ({ label, foreground, background }) =>
      `${label} (${contrastRatio(colors[foreground], colors[background]).toFixed(1)}:1)`,
  );
}
