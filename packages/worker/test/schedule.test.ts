import { describe, expect, it } from "vitest";
import type { Camera } from "@ch/core";
import { isCaptureDue, isInActiveWindow, minutesInZone } from "../src/schedule.js";

const baseCam: Camera = {
  id: "c1",
  tenantId: "t1",
  name: "Main",
  feedType: "static_url",
  feedUrl: "https://example.com/cam.jpg",
  feedConfig: {},
  intervalMinutes: 15,
  activeFrom: "00:00",
  activeTo: "23:59",
  timezone: "UTC",
  enabled: true,
  theme: "light",
  lastCaptureAt: null,
  lastError: null,
};

describe("minutesInZone", () => {
  it("converts UTC noon to Prague time", () => {
    const summerNoon = new Date("2026-07-18T12:00:00Z");
    expect(minutesInZone(summerNoon, "Europe/Prague")).toBe(14 * 60);
  });
});

describe("isInActiveWindow", () => {
  it("full day when from == to", () => {
    expect(isInActiveWindow(baseCam, new Date("2026-07-18T03:00:00Z"))).toBe(true);
  });
  it("respects day window", () => {
    const cam = { ...baseCam, activeFrom: "09:00", activeTo: "17:00", timezone: "UTC" };
    expect(isInActiveWindow(cam, new Date("2026-07-18T12:00:00Z"))).toBe(true);
    expect(isInActiveWindow(cam, new Date("2026-07-18T20:00:00Z"))).toBe(false);
  });
  it("handles overnight window", () => {
    const cam = { ...baseCam, activeFrom: "22:00", activeTo: "06:00", timezone: "UTC" };
    expect(isInActiveWindow(cam, new Date("2026-07-18T23:00:00Z"))).toBe(true);
    expect(isInActiveWindow(cam, new Date("2026-07-18T12:00:00Z"))).toBe(false);
  });
});

describe("isCaptureDue", () => {
  it("due when no last capture", () => {
    expect(isCaptureDue(baseCam, new Date("2026-07-18T12:00:00Z"))).toBe(true);
  });
  it("not due within interval", () => {
    const cam = { ...baseCam, lastCaptureAt: new Date("2026-07-18T11:00:00Z") };
    expect(isCaptureDue(cam, new Date("2026-07-18T11:05:00Z"))).toBe(false);
  });
  it("due after interval elapses", () => {
    const cam = { ...baseCam, lastCaptureAt: new Date("2026-07-18T11:00:00Z") };
    expect(isCaptureDue(cam, new Date("2026-07-18T11:15:00Z"))).toBe(true);
  });
  it("disabled camera never due", () => {
    const cam = { ...baseCam, enabled: false };
    expect(isCaptureDue(cam, new Date("2026-07-18T12:00:00Z"))).toBe(false);
  });
});