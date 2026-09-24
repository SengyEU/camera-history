import { describe, expect, it } from "vitest";
import {
  BILLING_TIERS,
  eurPerCamera,
  isValidPlanMonths,
  monthsForPriceId,
  priceIdForTier,
} from "../src/billing.js";

describe("billing catalog", () => {
  it("exposes the 7 approved tiers with eur and labels", () => {
    expect(BILLING_TIERS.map((t) => t.months)).toEqual([0.5, 1, 3, 6, 12, 24, 36]);
    expect(BILLING_TIERS[3]).toMatchObject({ label: "6 měsíců", eurPerCamera: 22 });
  });

  it("validates plan months against whitelist", () => {
    expect(isValidPlanMonths(12)).toBe(true);
    expect(isValidPlanMonths(0.5)).toBe(true);
    expect(isValidPlanMonths(7)).toBe(false);
    expect(isValidPlanMonths(0)).toBe(false);
  });

  it("looks up eur per camera", () => {
    expect(eurPerCamera(14)).toBeNull();
    expect(eurPerCamera(0.5)).toBe(5);
    expect(eurPerCamera(36)).toBe(69);
  });

  it("maps tier to price id and back", () => {
    const prices = { "12": "price_12", "0.5": "price_half" };
    expect(priceIdForTier(prices, 12)).toBe("price_12");
    expect(priceIdForTier(prices, 24)).toBeNull();
    expect(monthsForPriceId(prices, "price_half")).toBe(0.5);
    expect(monthsForPriceId(prices, "nope")).toBeNull();
  });
});
