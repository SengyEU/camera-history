import { describe, expect, it } from "vitest";
import {
  DEFAULT_PACKAGE,
  PACKAGE_TIERS,
  RETENTION_MONTHS,
  cameraLimitForPackage,
  isPackageCode,
  isTenantBillable,
  packageForCameraCount,
  packageForCode,
  packageForPriceId,
  priceIdForPackage,
} from "../src/billing.js";

describe("package catalog", () => {
  it("exposes the five approved packages with limits and prices", () => {
    expect(PACKAGE_TIERS).toEqual([
      { code: "solo", name: "Solo", maxCameras: 1, eurPerMonth: 7.99, priceEnv: "STRIPE_PRICE_SOLO" },
      { code: "starter", name: "Starter", maxCameras: 3, eurPerMonth: 13.99, priceEnv: "STRIPE_PRICE_STARTER" },
      { code: "plus", name: "Plus", maxCameras: 5, eurPerMonth: 19.99, priceEnv: "STRIPE_PRICE_PLUS" },
      { code: "pro", name: "Pro", maxCameras: 10, eurPerMonth: 29.99, priceEnv: "STRIPE_PRICE_PRO" },
      { code: "network", name: "Network", maxCameras: 25, eurPerMonth: 49.99, priceEnv: "STRIPE_PRICE_NETWORK" },
    ]);
    expect(DEFAULT_PACKAGE).toBe("starter");
    expect(RETENTION_MONTHS).toBe(12);
  });

  it("validates package codes", () => {
    expect(isPackageCode("solo")).toBe(true);
    expect(isPackageCode("network")).toBe(true);
    expect(isPackageCode("enterprise")).toBe(false);
    expect(isPackageCode("")).toBe(false);
  });

  it("looks up packages and camera limits", () => {
    expect(packageForCode("plus")?.maxCameras).toBe(5);
    expect(packageForCode("nope")).toBeNull();
    expect(cameraLimitForPackage("starter")).toBe(3);
    expect(cameraLimitForPackage("nope")).toBe(0);
  });

  it("maps packages to price ids and back", () => {
    const prices = { solo: "price_solo", starter: "price_starter", network: "price_network" };
    expect(priceIdForPackage(prices, "starter")).toBe("price_starter");
    expect(priceIdForPackage(prices, "pro")).toBeNull();
    expect(packageForPriceId(prices, "price_network")).toBe("network");
    expect(packageForPriceId(prices, "nope")).toBeNull();
  });

  it("gates captures on active billing, grace or an unexpired pilot", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const base = {
      billingStatus: "none" as const,
      billingGraceUntil: null,
      isPilot: false,
      pilotUntil: null,
    };

    expect(isTenantBillable({ ...base, billingStatus: "active" }, now)).toBe(true);
    expect(isTenantBillable({ ...base, billingStatus: "past_due", billingGraceUntil: new Date("2026-11-22T12:00:00Z") }, now)).toBe(true);
    expect(isTenantBillable({ ...base, billingStatus: "past_due", billingGraceUntil: new Date("2026-11-20T12:00:00Z") }, now)).toBe(false);
    expect(isTenantBillable({ ...base, billingStatus: "past_due" }, now)).toBe(false);
    expect(isTenantBillable({ ...base, billingStatus: "unpaid" }, now)).toBe(false);
    expect(isTenantBillable({ ...base, billingStatus: "canceled" }, now)).toBe(false);
    expect(isTenantBillable({ ...base, isPilot: true }, now)).toBe(true);
    expect(isTenantBillable({ ...base, isPilot: true, pilotUntil: new Date("2027-01-01T12:00:00Z") }, now)).toBe(true);
    expect(isTenantBillable({ ...base, isPilot: true, pilotUntil: new Date("2026-11-01T12:00:00Z") }, now)).toBe(false);
  });

  it("picks the smallest fitting package for a camera count", () => {
    expect(packageForCameraCount(0).code).toBe("starter");
    expect(packageForCameraCount(1).code).toBe("solo");
    expect(packageForCameraCount(2).code).toBe("starter");
    expect(packageForCameraCount(3).code).toBe("starter");
    expect(packageForCameraCount(4).code).toBe("plus");
    expect(packageForCameraCount(5).code).toBe("plus");
    expect(packageForCameraCount(6).code).toBe("pro");
    expect(packageForCameraCount(10).code).toBe("pro");
    expect(packageForCameraCount(11).code).toBe("network");
    expect(packageForCameraCount(25).code).toBe("network");
    expect(packageForCameraCount(26).code).toBe("network");
  });
});
