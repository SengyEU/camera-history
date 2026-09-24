import type { AppConfig } from "@ch/core";
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
      const item = await input.metering.listSubscriptionItem({ subscriptionId: tenant.stripeSubscriptionId });
      if (!item) continue;
      const quantity = await input.repos.countCameras(tenant.id);
      await input.metering.reportUsage({
        subscriptionItem: item.id,
        quantity,
        timestamp: Math.floor(now.getTime() / 1000),
      });
      lastReported.set(tenant.id, now.getTime());
      log(`billing: reported usage ${quantity} cameras for tenant ${tenant.id}`);
    }
  }
}