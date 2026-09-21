import { describe, expect, it } from "vitest";
import { dayRangeUtc, gatedRange, retentionCutoff } from "../src/retention.js";

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