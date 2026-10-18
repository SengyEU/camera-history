import { describe, expect, it } from "vitest";
import type { Camera } from "@ch/core";
import { isCaptureDue, isInActiveWindow, isInDaylightWindow, minutesInZone } from "../src/schedule.js";

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
  latitude: null,
  longitude: null,
  daylightOnly: false,
  showNight: false,
  lastCaptureAt: null,
  lastError: null,
  status: "operational",
};

// Lake Louise, 2026-07-18: sunrise 11:47:57Z, sunset 2026-07-19 03:53:39Z.
const lakeLouiseCam: Camera = {
  ...baseCam,
  latitude: 51.425,
  longitude: -116.177,
  timezone: "America/Edmonton",
  daylightOnly: true,
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

describe("isInDaylightWindow", () => {
  it("null when daylightOnly is false", () => {
    expect(isInDaylightWindow(baseCam, new Date("2026-07-18T12:00:00Z"))).toBeNull();
  });
  it("null when coordinates are missing", () => {
    const cam = { ...baseCam, daylightOnly: true };
    expect(isInDaylightWindow(cam, new Date("2026-07-18T12:00:00Z"))).toBeNull();
  });
  it("null on polar day/night", () => {
    const cam = { ...baseCam, daylightOnly: true, latitude: 69.65, longitude: 18.956, timezone: "Europe/Oslo" };
    expect(isInDaylightWindow(cam, new Date("2026-06-21T12:00:00Z"))).toBeNull();
  });
  it("true between sunrise and sunset for the local date", () => {
    expect(isInDaylightWindow(lakeLouiseCam, new Date("2026-07-18T18:00:00Z"))).toBe(true);
  });
  it("false before sunrise", () => {
    expect(isInDaylightWindow(lakeLouiseCam, new Date("2026-07-18T08:00:00Z"))).toBe(false);
  });
  it("false after sunset", () => {
    expect(isInDaylightWindow(lakeLouiseCam, new Date("2026-07-19T05:30:00Z"))).toBe(false);
  });
});

describe("isCaptureDue with daylightOnly", () => {
  const mountainTimeCam: Camera = {
    ...baseCam,
    latitude: 51.425,
    longitude: -116.177,
    timezone: "America/Edmonton",
    activeFrom: "09:00",
    activeTo: "17:00",
  };

  it("due inside daylight", () => {
    // Active window 18:00–20:00 local excludes 12:00 local, so only the daylight branch can make this due.
    const cam = { ...lakeLouiseCam, activeFrom: "18:00", activeTo: "20:00" };
    expect(isCaptureDue(cam, new Date("2026-07-18T18:00:00Z"))).toBe(true);
  });
  it("uses the camera-local date for the daylight window, not the UTC date", () => {
    // 2026-07-18T01:00Z = 19:00 MDT on Jul 17, inside Jul 17's daylight (11:46:43Z–Jul 18 03:54:42Z).
    // A UTC-date implementation would check Jul 18 (sunrise 11:47:57Z) and return false.
    expect(isCaptureDue(lakeLouiseCam, new Date("2026-07-18T01:00:00Z"))).toBe(true);
  });
  it("not due outside daylight even when active window would allow it", () => {
    expect(isCaptureDue(lakeLouiseCam, new Date("2026-07-18T08:00:00Z"))).toBe(false);
    expect(isCaptureDue(lakeLouiseCam, new Date("2026-07-19T05:30:00Z"))).toBe(false);
  });
  it("daylight overrides the active window", () => {
    const cam = { ...lakeLouiseCam, activeFrom: "09:00", activeTo: "10:00" };
    expect(isCaptureDue(cam, new Date("2026-07-18T18:00:00Z"))).toBe(true);
  });
  it("falls back to active window when coordinates are missing", () => {
    const cam = { ...baseCam, daylightOnly: true, activeFrom: "09:00", activeTo: "17:00" };
    expect(isCaptureDue(cam, new Date("2026-07-18T12:00:00Z"))).toBe(true);
    expect(isCaptureDue(cam, new Date("2026-07-18T18:00:00Z"))).toBe(false);
  });
  it("falls back to active window on polar day/night", () => {
    const cam = {
      ...baseCam,
      daylightOnly: true,
      latitude: 69.65,
      longitude: 18.956,
      timezone: "UTC",
      activeFrom: "09:00",
      activeTo: "17:00",
    };
    expect(isCaptureDue(cam, new Date("2026-06-21T12:00:00Z"))).toBe(true);
    expect(isCaptureDue(cam, new Date("2026-06-21T18:00:00Z"))).toBe(false);
  });
  it("unchanged active-window behavior when daylightOnly is false", () => {
    expect(isCaptureDue(mountainTimeCam, new Date("2026-07-18T16:00:00Z"))).toBe(true); // 10:00 local
    expect(isCaptureDue(mountainTimeCam, new Date("2026-07-18T08:00:00Z"))).toBe(false); // 02:00 local
  });
  it("ignores daylight when daylightOnly is false", () => {
    // 14:00Z = 08:00 local: inside daylight (sunrise 11:47:57Z) but outside the 09:00–17:00 window.
    expect(isCaptureDue(mountainTimeCam, new Date("2026-07-18T14:00:00Z"))).toBe(false);
  });
});
