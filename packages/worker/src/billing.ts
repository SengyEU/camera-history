import { BILLING_TIERS, priceIdForTier, type AppConfig } from "@ch/core";
import type { Repos } from "@ch/db";
import type { MeteringGateway } from "./stripe.js";

export type { MeteringGateway } from "./stripe.js";

export interface BillingJobInput {
  repos: Repos;
  cfg: AppConfig;
  metering: MeteringGateway | null;
  now?: Date;
  log?: (message: string) => void;
}

const REPORT_DAMPEN_MS = 3_600_000;
const lastReported = new Map<string, number>();

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

  if (input.metering && input.cfg.stripe.enabled) {
    for (const tenant of await input.repos.listTenantsByBillingStatus("active")) {
      const last = lastReported.get(tenant.id) ?? 0;
      if (now.getTime() - last < REPORT_DAMPEN_MS) continue;
      if (!tenant.stripeSubscriptionId) continue;
      const items = await input.metering.listSubscriptionItems({
        subscriptionId: tenant.stripeSubscriptionId,
      });
      if (items.length === 0) continue;
      const counts = await input.repos.cameraPlanCounts(tenant.id);
      const timestamp = Math.floor(now.getTime() / 1000);
      let reported = 0;
      for (const tier of BILLING_TIERS) {
        const priceId = priceIdForTier(input.cfg.stripe.prices, tier.months);
        if (!priceId) continue;
        const item = items.find((entry) => entry.priceId === priceId);
        if (!item) continue;
        const quantity = counts.get(tier.months) ?? 0;
        await input.metering.reportUsage({
          subscriptionItem: item.id,
          quantity,
          timestamp,
        });
        reported += 1;
      }
      if (reported === 0) continue;
      lastReported.set(tenant.id, now.getTime());
      log(`billing: reported usage for ${reported} plan tiers for tenant ${tenant.id}`);
    }
  }
}