import Stripe from "stripe";
import type { AppConfig } from "@ch/core";

export interface MeteringGateway {
  listSubscriptionItems(input: { subscriptionId: string }): Promise<Array<{ id: string; priceId: string }>>;
  reportUsage(input: { subscriptionItem: string; quantity: number; timestamp: number }): Promise<void>;
}

export function createMeteringGateway(cfg: AppConfig): MeteringGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async listSubscriptionItems({ subscriptionId }) {
      const items = await stripe.subscriptionItems.list({ subscription: subscriptionId, limit: 100 });
      return items.data.map((item) => ({
        id: item.id,
        priceId: typeof item.price === "string" ? item.price : item.price.id,
      }));
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