import Stripe from "stripe";
import type { AppConfig } from "@ch/core";

export interface SubscriptionSyncGateway {
  scheduleAutoCancel(input: { subscriptionId: string }): Promise<void>;
  resumeAutoCancel(input: { subscriptionId: string }): Promise<void>;
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;
}

export function createSubscriptionSyncGateway(cfg: AppConfig): SubscriptionSyncGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async scheduleAutoCancel({ subscriptionId }) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.cancel_at_period_end) return;
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        metadata: { ...subscription.metadata, auto_cancel_no_cameras: "1" },
      });
    },
    async resumeAutoCancel({ subscriptionId }) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (!subscription.cancel_at_period_end) return;
      if (subscription.metadata.auto_cancel_no_cameras !== "1") return;
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
        metadata: { ...subscription.metadata, auto_cancel_no_cameras: "" },
      });
    },
    async cancelSubscription({ subscriptionId }) {
      await stripe.subscriptions.cancel(subscriptionId);
    },
  };
}
