import type { Camera } from "@ch/core";

export function minutesInZone(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

export function isInActiveWindow(cam: Camera, now: Date): boolean {
  const current = minutesInZone(now, cam.timezone);
  const [fromH, fromM] = cam.activeFrom.split(":").map(Number) as [number, number];
  const [toH, toM] = cam.activeTo.split(":").map(Number) as [number, number];
  const from = fromH * 60 + fromM;
  const to = toH * 60 + toM;
  if (from === to) return true; // celý den
  if (from < to) return current >= from && current < to;
  return current >= from || current < to; // přes půlnoc
}

export function isCaptureDue(cam: Camera, now: Date): boolean {
  if (!cam.enabled) return false;
  if (!isInActiveWindow(cam, now)) return false;
  if (!cam.lastCaptureAt) return true;
  const last = cam.lastCaptureAt.getTime();
  const intervalMs = cam.intervalMinutes * 60_000;
  return now.getTime() - last >= intervalMs;
}