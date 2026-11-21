export const RETENTION_MONTHS = 12;

export type PackageCode = "solo" | "starter" | "plus" | "pro" | "network";

export interface PackageTier {
  code: PackageCode;
  name: string;
  maxCameras: number;
  eurPerMonth: number;
  priceEnv: string;
}

export const PACKAGE_TIERS: PackageTier[] = [
  { code: "solo", name: "Solo", maxCameras: 1, eurPerMonth: 7.99, priceEnv: "STRIPE_PRICE_SOLO" },
  { code: "starter", name: "Starter", maxCameras: 3, eurPerMonth: 13.99, priceEnv: "STRIPE_PRICE_STARTER" },
  { code: "plus", name: "Plus", maxCameras: 5, eurPerMonth: 19.99, priceEnv: "STRIPE_PRICE_PLUS" },
  { code: "pro", name: "Pro", maxCameras: 10, eurPerMonth: 29.99, priceEnv: "STRIPE_PRICE_PRO" },
  { code: "network", name: "Network", maxCameras: 25, eurPerMonth: 49.99, priceEnv: "STRIPE_PRICE_NETWORK" },
];

export const DEFAULT_PACKAGE: PackageCode = "starter";

export function isPackageCode(value: string): value is PackageCode {
  return PACKAGE_TIERS.some((tier) => tier.code === value);
}

export function packageForCode(code: string): PackageTier | null {
  return PACKAGE_TIERS.find((tier) => tier.code === code) ?? null;
}

export function cameraLimitForPackage(code: string): number {
  return packageForCode(code)?.maxCameras ?? 0;
}

export function priceIdForPackage(
  prices: Record<string, string>,
  code: string,
): string | null {
  const id = prices[code];
  return id && id !== "" ? id : null;
}

export function packageForPriceId(
  prices: Record<string, string>,
  priceId: string,
): PackageCode | null {
  for (const [code, value] of Object.entries(prices)) {
    if (value === priceId && isPackageCode(code)) return code;
  }
  return null;
}

/**
 * Smallest package that fits the camera count for a backfill.
 * A tenant with one camera gets Solo; zero cameras gets the default Starter,
 * so a new empty tenant is not capped at one camera.
 */
export function packageForCameraCount(count: number): PackageTier {
  if (count === 1) return packageForCode("solo")!;
  if (count <= 3) return packageForCode("starter")!;
  if (count <= 5) return packageForCode("plus")!;
  if (count <= 10) return packageForCode("pro")!;
  return packageForCode("network")!;
}

export type BillableStatus = "none" | "active" | "past_due" | "unpaid" | "canceled";

export interface TenantBillingState {
  billingStatus: BillableStatus;
  billingGraceUntil: Date | null;
  isPilot: boolean;
  pilotUntil: Date | null;
}

/**
 * Whether captures may run for this tenant.
 *
 * Setup is free: a tenant can register and add cameras before paying. Captures
 * start only when billing is active, during the past-due grace window, or for a
 * pilot that has not expired. `none` is deliberately not billable.
 */
export function isTenantBillable(state: TenantBillingState, now: Date): boolean {
  if (state.billingStatus === "active") return true;
  if (
    state.billingStatus === "past_due" &&
    state.billingGraceUntil !== null &&
    state.billingGraceUntil.getTime() > now.getTime()
  ) {
    return true;
  }
  if (
    state.isPilot &&
    (state.pilotUntil === null || state.pilotUntil.getTime() > now.getTime())
  ) {
    return true;
  }
  return false;
}
