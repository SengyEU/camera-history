export interface HourParts {
  hour: number;
  meridiem: "AM" | "PM";
}

export function localDateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function safeMinDate(
  retentionMonths: number | null | undefined,
  timezone: string | null | undefined,
): string | undefined {
  if (
    typeof retentionMonths !== "number" ||
    !Number.isFinite(retentionMonths) ||
    retentionMonths <= 0 ||
    !timezone
  ) {
    return undefined;
  }
  const floor = new Date(Date.now() - retentionMonths * 30 * 24 * 3600 * 1000);
  if (Number.isNaN(floor.getTime())) return undefined;
  try {
    return localDateInZone(floor, timezone);
  } catch {
    return undefined;
  }
}

export function localHourParts(timestamp: string, timeZone: string): HourParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: true,
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12");
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;
  return { hour, meridiem: dayPeriod === "PM" ? "PM" : "AM" };
}

export function localHourInZone(timestamp: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
}

export function formatCameraHour(timestamp: string, timeZone: string): string {
  const { hour, meridiem } = localHourParts(timestamp, timeZone);
  return `${hour} ${meridiem}`;
}

export function formatCameraDate(timestamp: string, timeZone: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCameraCaptureLabel(timestamp: string, timeZone: string): string {
  return `${formatCameraDate(timestamp, timeZone)} · ${formatCameraHour(timestamp, timeZone)}`;
}
