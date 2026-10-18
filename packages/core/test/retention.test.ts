import { describe, expect, it } from "vitest";
import { dayRangeInZone, dayRangeUtc, gatedRange, retentionCutoff } from "../src/retention.js";

describe("dayRangeUtc", () => {
  it("parses YYYY-MM-DD into exclusive UTC day range", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    expect(start.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("rejects malformed dates", () => {
    expect(() => dayRangeUtc("18-09-2026")).toThrow(RangeError);
  });
});

describe("dayRangeInZone", () => {
  const hours = (range: { start: Date; end: Date }) =>
    (range.end.getTime() - range.start.getTime()) / 3_600_000;

  it("returns a 24h range for a normal Prague day", () => {
    const range = dayRangeInZone("2026-09-18", "Europe/Prague");
    expect(range.start.toISOString()).toBe("2026-09-17T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-18T22:00:00.000Z");
    expect(hours(range)).toBe(24);
  });

  it("returns a 23h range for the Prague spring-forward day", () => {
    const range = dayRangeInZone("2026-03-29", "Europe/Prague");
    expect(range.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(hours(range)).toBe(23);
  });

  it("returns a 25h range for the Prague fall-back day", () => {
    const range = dayRangeInZone("2026-10-25", "Europe/Prague");
    expect(range.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(hours(range)).toBe(25);
  });

  it("starts an America/Edmonton day at 06:00Z during MDT", () => {
    const range = dayRangeInZone("2026-10-18", "America/Edmonton");
    expect(range.start.toISOString()).toBe("2026-10-18T06:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-19T06:00:00.000Z");
  });

  it("advances the month boundary", () => {
    const range = dayRangeInZone("2026-12-31", "Europe/Prague");
    expect(range.start.toISOString()).toBe("2026-12-30T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("rejects malformed dates like dayRangeUtc", () => {
    expect(() => dayRangeInZone("18-09-2026", "Europe/Prague")).toThrow(RangeError);
  });

  it("rejects an unknown timezone", () => {
    expect(() => dayRangeInZone("2026-09-18", "Not/AZone")).toThrow(RangeError);
  });
});

describe("retentionCutoff", () => {
  it("subtracts calendar months from now", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const cutoff = retentionCutoff(12, now);
    expect(cutoff.toISOString()).toBe("2025-09-18T12:00:00.000Z");
  });

  it("clamps to end-of-month correctly", () => {
    const now = new Date("2026-03-31T00:00:00.000Z");
    const cutoff = retentionCutoff(1, now);
    expect(cutoff.getUTCMonth()).toBe(2); // únor
  });

  it("retentionCutoff supports 0.5 month as 14 days", () => {
    const r = retentionCutoff(0.5, new Date("2026-09-18T00:00:00Z"));
    expect(r.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("retentionCutoff throws below 0.5", () => {
    expect(() => retentionCutoff(0.4, new Date())).toThrow(RangeError);
  });
});

describe("gatedRange", () => {
  it("keeps full day when cutoff predates day", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const range = gatedRange(start, end, cutoff);
    expect(range.start.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("truncates start when cutoff falls mid-day", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    const cutoff = new Date("2026-09-18T10:00:00.000Z");
    const range = gatedRange(start, end, cutoff);
    expect(range.start.toISOString()).toBe("2026-09-18T10:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});