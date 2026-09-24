import Stripe from "stripe";
import type { AppConfig } from "@ch/core";

export interface MeteringGateway {
  listSubscriptionItem(input: { subscriptionId: string }): Promise<{ id: string } | null>;
  reportUsage(input: { subscriptionItem: string; quantity: number; timestamp: number }): Promise<void>;
}

export function createMeteringGateway(cfg: AppConfig): MeteringGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async listSubscriptionItem({ subscriptionId }) {
      const items = await stripe.subscriptionItems.list({ subscription: subscriptionId, limit: 1 });
      const item = items.data[0];
      return item ? { id: item.id } : null;
    },
    async reportUsage({ subscriptionItem, quantity, timestamp }) {
      await stripe.rawRequest("POST", "/v1/usage_records", {
        subscription_item: subscriptionItem,
        quantity,
        timestamp,
      });
    },
  };
}