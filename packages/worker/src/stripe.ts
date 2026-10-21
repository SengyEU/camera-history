import Stripe from "stripe";
import type { AppConfig } from "@ch/core";

export interface SubscriptionItemsClient {
  subscriptionItems: {
    list(params: {
      subscription: string;
      limit: number;
      expand: string[];
    }): Promise<{
      data: Array<{ id: string; quantity: number; price: string | { id: string } }>;
    }>;
    create(params: {
      subscription: string;
      price: string;
      quantity: number;
      proration_behavior: string;
    }): Promise<unknown>;
    update(
      id: string,
      params: {
        quantity: number;
        proration_behavior: string;
      },
    ): Promise<unknown>;
    del(id: string, params: { proration_behavior: string }): Promise<unknown>;
  };
}

export async function syncSubscriptionItems(
  client: SubscriptionItemsClient,
  subscriptionId: string,
  items: Array<{ priceId: string; quantity: number }>,
): Promise<void> {
  const existing = await client.subscriptionItems.list({
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
    if (quantity !== undefined && item.quantity !== quantity) {
      await client.subscriptionItems.update(item.id, {
        quantity,
        proration_behavior: "create_prorations",
      });
    }
  }

  for (const item of items) {
    if (existingPrices.has(item.priceId)) continue;
    await client.subscriptionItems.create({
      subscription: subscriptionId,
      price: item.priceId,
      quantity: item.quantity,
      proration_behavior: "create_prorations",
    });
  }

  for (const item of existing.data) {
    const priceId = typeof item.price === "string" ? item.price : item.price.id;
    if (desired.has(priceId)) continue;
    await client.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
  }
}

export interface SubscriptionSyncGateway {
  syncSubscription(input: {
    subscriptionId: string;
    items: Array<{ priceId: string; quantity: number }>;
  }): Promise<void>;
  scheduleAutoCancel(input: { subscriptionId: string }): Promise<void>;
  resumeAutoCancel(input: { subscriptionId: string }): Promise<void>;
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;
}

export function createSubscriptionSyncGateway(cfg: AppConfig): SubscriptionSyncGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async syncSubscription({ subscriptionId, items }) {
      await syncSubscriptionItems(
        stripe as unknown as SubscriptionItemsClient,
        subscriptionId,
        items,
      );
    },
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
