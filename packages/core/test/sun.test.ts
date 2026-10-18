import { describe, expect, it } from "vitest";
import { localDateInZone, localHourInZone, sunTimes } from "../src/sun.js";

const min = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

describe("sunTimes", () => {
  it("Prague summer solstice", () => {
    const t = sunTimes("2026-06-21", 50.08, 14.42)!;
    expect(t).not.toBeNull();
    // ~04:53 CEST sunrise / ~21:11 CEST sunset (UTC 02:53 / 19:11), tolerance ±6 min
    expect(Math.abs(min(t.sunrise) - (2 * 60 + 53))).toBeLessThanOrEqual(6);
    expect(Math.abs(min(t.sunset) - (19 * 60 + 11))).toBeLessThanOrEqual(6);
  });
  it("Prague winter solstice", () => {
    const t = sunTimes("2026-12-21", 50.08, 14.42)!;
    // ~07:58 CET / ~16:03 CET (UTC 06:58 / 15:03), ±6 min
    expect(Math.abs(min(t.sunrise) - (6 * 60 + 58))).toBeLessThanOrEqual(6);
    expect(Math.abs(min(t.sunset) - (15 * 60 + 3))).toBeLessThanOrEqual(6);
  });
  it("Lake Louise mid-October (west longitude)", () => {
    const t = sunTimes("2026-10-18", 51.425, -116.177)!;
    // Timeanddate/sunrise-sunset.org for 2026-10-18: 08:14 MDT / 18:44 MDT
    // (UTC 14:14 / 00:44+1d). The brief's original centers (08:00/18:40) sit
    // outside ±8 min of the observed values, so the centers were corrected
    // and the tolerances kept unchanged. ±8 min
    const sunsetMin = min(t.sunset) + (t.sunset.getUTCDate() !== t.sunrise.getUTCDate() ? 1440 : 0);
    expect(Math.abs(min(t.sunrise) - (14 * 60 + 14))).toBeLessThanOrEqual(8);
    expect(Math.abs(sunsetMin - (24 * 60 + 44))).toBeLessThanOrEqual(8);
  });
  it("equator is ~06:00/18:00 all year", () => {
    const t = sunTimes("2026-03-21", 0, 0)!;
    // Equinox day is slightly asymmetric at longitude 0 (equation of time
    // -7.5 min, declination +0.4°): observed 06:05 / 18:11 UTC. Centers
    // corrected from the brief's 06:00/18:00 (18:11 exceeded ±10), tolerance
    // kept unchanged. ±10 min
    expect(Math.abs(min(t.sunrise) - (6 * 60 + 5))).toBeLessThanOrEqual(10);
    expect(Math.abs(min(t.sunset) - (18 * 60 + 11))).toBeLessThanOrEqual(10);
  });
  it("polar midsummer returns null (Tromsø)", () => {
    expect(sunTimes("2026-06-21", 69.65, 18.96)).toBeNull();
  });
});

describe("localDateInZone", () => {
  it("maps a UTC instant near midnight to the zone's local date", () => {
    const nearMidnightUtc = new Date("2026-10-18T00:00:00Z");
    expect(localDateInZone(nearMidnightUtc, "America/Edmonton")).toBe("2026-10-17");
    expect(localDateInZone(nearMidnightUtc, "UTC")).toBe("2026-10-18");
  });
});

describe("localHourInZone", () => {
  it("converts UTC instants to the zone's hour", () => {
    expect(localHourInZone(new Date("2026-07-18T12:00:00Z"), "Europe/Prague")).toBe(14);
    expect(localHourInZone(new Date("2026-07-18T23:30:00Z"), "Europe/Prague")).toBe(1);
    expect(localHourInZone(new Date("2026-01-18T23:30:00Z"), "Europe/Prague")).toBe(0);
    expect(localHourInZone(new Date("2026-07-18T23:30:00Z"), "UTC")).toBe(23);
  });
});
