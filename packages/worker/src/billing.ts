import { BILLING_TIERS, priceIdForTier, type AppConfig } from "@ch/core";
import type { Repos } from "@ch/db";
import type { SubscriptionSyncGateway } from "./stripe.js";

export type { SubscriptionSyncGateway } from "./stripe.js";

export interface BillingJobInput {
  repos: Repos;
  cfg: AppConfig;
  sync: SubscriptionSyncGateway | null;
  now?: Date;
  log?: (message: string) => void;
}

const REPORT_DAMPEN_MS = 3_600_000;
const lastSynced = new Map<string, number>();

export async function runBillingJobs(input: BillingJobInput): Promise<void> {
  const now = input.now ?? new Date();
  const log = input.log ?? (() => {});

  const pastDue = await input.repos.listTenantsByBillingStatus("past_due");
  for (const tenant of pastDue) {
    if (tenant.billingGraceUntil && tenant.billingGraceUntil.getTime() < now.getTime()) {
      await input.repos.setTenantCamerasEnabled(tenant.id, false);
      await input.repos.setBillingState(tenant.id, { billingStatus: "unpaid", billingGraceUntil: null });
      log(`billing: tenant ${tenant.id} marked unpaid, cameras disabled`);
    }
  }

  if (input.sync && input.cfg.stripe.enabled) {
    for (const tenant of await input.repos.listTenantsByBillingStatus("active")) {
      const last = lastSynced.get(tenant.id) ?? 0;
      if (now.getTime() - last < REPORT_DAMPEN_MS) continue;
      if (!tenant.stripeSubscriptionId) continue;
      const counts = await input.repos.cameraPlanCounts(tenant.id);
      const items = BILLING_TIERS.map((tier) => ({
        priceId: priceIdForTier(input.cfg.stripe.prices, tier.months) ?? "",
        quantity: counts.get(tier.months) ?? 0,
      })).filter((item) => item.priceId !== "" && item.quantity > 0);
      await input.sync.syncSubscription({ subscriptionId: tenant.stripeSubscriptionId, items });
      lastSynced.set(tenant.id, now.getTime());
      log(`billing: synced ${items.length} plan item(s) for tenant ${tenant.id}`);
    }
  }
}
