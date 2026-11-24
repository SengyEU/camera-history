export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} kB`;
  return `${n} B`;
}

export function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const started = new Date(iso).getTime();
  if (!Number.isFinite(started)) return "—";
  const diff = Date.now() - started;
  if (diff <= 0) return "just now";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours} h`;
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  return `${minutes} min`;
}

function asDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | number | Date | null | undefined,
  timeZone?: string,
): string {
  const date = asDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  timeZone?: string,
  timeFormat: "12h" | "24h" = "24h",
): string {
  const date = asDate(value);
  if (!date) return "—";
  const datePart = formatDate(date, timeZone);
  const timePart = date.toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });
  return `${datePart} · ${timePart}`;
}
