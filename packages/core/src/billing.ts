export interface BillingTier {
  months: number;
  label: string;
  eurPerCamera: number;
}

export const BILLING_TIERS: BillingTier[] = [
  { months: 0.5, label: "14 dní", eurPerCamera: 5 },
  { months: 1, label: "1 měsíc", eurPerCamera: 9 },
  { months: 3, label: "3 měsíce", eurPerCamera: 15 },
  { months: 6, label: "6 měsíců", eurPerCamera: 22 },
  { months: 12, label: "12 měsíců", eurPerCamera: 29 },
  { months: 24, label: "24 měsíců", eurPerCamera: 49 },
  { months: 36, label: "36 měsíců", eurPerCamera: 69 },
];

export function isValidPlanMonths(months: number): boolean {
  return BILLING_TIERS.some((t) => t.months === months);
}

export function eurPerCamera(months: number): number | null {
  return BILLING_TIERS.find((t) => t.months === months)?.eurPerCamera ?? null;
}

export function priceIdForTier(prices: Record<string, string>, months: number): string | null {
  const id = prices[String(months)];
  return id && id !== "" ? id : null;
}

export function monthsForPriceId(prices: Record<string, string>, priceId: string): number | null {
  for (const [key, value] of Object.entries(prices)) {
    if (value === priceId) {
      const months = Number(key);
      if (Number.isFinite(months)) return months;
    }
  }
  return null;
}
