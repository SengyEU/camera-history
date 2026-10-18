import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeMinDate } from "../time";

describe("safeMinDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T05:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the retention floor in the given timezone", () => {
    expect(safeMinDate(2, "UTC")).toBe("2026-08-19");
  });

  it("returns undefined for missing or non-positive retention", () => {
    expect(safeMinDate(undefined, "UTC")).toBeUndefined();
    expect(safeMinDate(null, "UTC")).toBeUndefined();
    expect(safeMinDate(0, "UTC")).toBeUndefined();
    expect(safeMinDate(-3, "UTC")).toBeUndefined();
  });

  it("returns undefined for non-finite retention", () => {
    expect(safeMinDate(Number.NaN, "UTC")).toBeUndefined();
    expect(safeMinDate(Number.POSITIVE_INFINITY, "UTC")).toBeUndefined();
  });

  it("returns undefined instead of throwing for an invalid timezone", () => {
    expect(safeMinDate(12, "Not/AZone")).toBeUndefined();
  });

  it("returns undefined when no timezone is provided", () => {
    expect(safeMinDate(12, undefined)).toBeUndefined();
  });
});
