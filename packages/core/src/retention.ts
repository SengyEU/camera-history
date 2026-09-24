export function dayRangeUtc(dateStr: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`invalid date: ${dateStr}`);
  const [, y, m, d] = match;
  const start = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
  const end = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 24, 0, 0));
  return { start, end };
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