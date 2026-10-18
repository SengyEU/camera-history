export function dayRangeUtc(dateStr: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`invalid date: ${dateStr}`);
  const [, y, m, d] = match;
  const start = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
  const end = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 24, 0, 0));
  return { start, end };
}

function zonedMidnightUtc(dateStr: string, timezone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`invalid date: ${dateStr}`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const desired = Date.parse(`${dateStr}T00:00:00Z`);
  let ts = desired;
  for (let i = 0; i < 2; i += 1) {
    const parts = fmt.formatToParts(ts);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const wallAsUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    ts += desired - wallAsUtc;
  }
  return ts;
}

function nextDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`invalid date: ${dateStr}`);
  const [, y, m, d] = match;
  const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${next.getUTCFullYear()}-${month}-${day}`;
}

/**
 * [start, end) UTC instants of a camera-local calendar day (YYYY-MM-DD in timezone).
 * Uses Intl-only math (no tz library); iterates to settle DST offsets.
 */
export function dayRangeInZone(dateStr: string, timezone: string): { start: Date; end: Date } {
  return {
    start: new Date(zonedMidnightUtc(dateStr, timezone)),
    end: new Date(zonedMidnightUtc(nextDate(dateStr), timezone)),
  };
}

export function retentionCutoff(months: number, now: Date = new Date()): Date {
  if (months < 0.5) throw new RangeError("months must be >= 0.5");
  const d = new Date(now);
  if (months === 0.5) {
    d.setUTCDate(d.getUTCDate() - 14);
    return d;
  }
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function gatedRange(
  dayStart: Date,
  dayEnd: Date,
  cutoff: Date,
): { start: Date; end: Date } {
  const end = dayEnd > cutoff ? dayEnd : cutoff;
  return { start: dayStart > cutoff ? dayStart : cutoff, end };
}