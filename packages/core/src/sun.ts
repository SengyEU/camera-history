const RAD = Math.PI / 180;

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/**
 * Sunrise/sunset (UTC instants) for a local calendar date at lat/lon.
 * NOAA/Spencer approximation; returns null for polar day/night or invalid input.
 */
export function sunTimes(dateLocal: string, lat: number, lon: number): SunTimes | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLocal);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const base = Date.UTC(y, mo - 1, d);
  const dayN = Math.floor((base - Date.UTC(y, 0, 0)) / 86_400_000); // 1..366
  const g = (2 * Math.PI / 365) * (dayN - 1);
  const cos = Math.cos;
  const sin = Math.sin;
  const eqtime =
    229.18 *
    (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g) - 0.014615 * cos(2 * g) - 0.040849 * sin(2 * g));
  const decl =
    0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g) - 0.006758 * cos(2 * g) +
    0.000907 * sin(2 * g) - 0.002697 * cos(3 * g) + 0.00148 * sin(3 * g);

  const zenith = 90.833 * RAD;
  const cosHa = cos(zenith) / (cos(lat * RAD) * cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null; // polar day/night

  const ha = Math.acos(cosHa) / RAD; // degrees
  const solarNoon = 720 - 4 * lon - eqtime; // minutes past UTC midnight
  return {
    sunrise: new Date(base + (solarNoon - 4 * ha) * 60_000),
    sunset: new Date(base + (solarNoon + 4 * ha) * 60_000),
  };
}

export function localDateInZone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function localHourInZone(ts: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
  }).formatToParts(ts);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return hour % 24;
}
