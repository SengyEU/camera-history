import Stripe from "stripe";
import type { AppConfig } from "@ch/core";

export interface SubscriptionSyncGateway {
  syncSubscription(input: {
    subscriptionId: string;
    items: Array<{ priceId: string; quantity: number }>;
  }): Promise<void>;
}

export function createSubscriptionSyncGateway(cfg: AppConfig): SubscriptionSyncGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async syncSubscription({ subscriptionId, items }) {
      const existing = await stripe.subscriptionItems.list({
        subscription: subscriptionId,
        limit: 100,
        expand: ["data.price"],
      });
      const desired = new Map(items.map((item) => [item.priceId, item.quantity]));
      const existingPrices = new Set<string>();

      for (const item of existing.data) {
        const priceId = typeof item.price === "string" ? item.price : item.price.id;
        existingPrices.add(priceId);
        const quantity = desired.get(priceId);
        if (quantity === undefined) {
          await stripe.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
        } else if (item.quantity !== quantity) {
          await stripe.subscriptionItems.update(item.id, {
            quantity,
            proration_behavior: "create_prorations",
          });
        }
      }

      for (const item of items) {
        if (existingPrices.has(item.priceId)) continue;
        await stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: item.priceId,
          quantity: item.quantity,
          proration_behavior: "create_prorations",
        });
      }
    },
  };
}
