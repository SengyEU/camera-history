import Stripe from "stripe";
import type { AppConfig, PackageCode } from "@ch/core";

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeGateway {
  createCustomer(input: { tenantId: string; email?: string; name?: string }): Promise<{ id: string }>;
  createCheckoutSession(input: {
    customer: string;
    priceId: string;
    tenantId: string;
    packageCode: PackageCode;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; customer: string | null; subscription: string | null }>;
  changePackage(input: {
    subscriptionId: string;
    priceId: string;
    packageCode: PackageCode;
  }): Promise<void>;
  createPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }>;
  verifyWebhook(input: { payload: string; signature: string }): Promise<StripeWebhookEvent>;
}

export function adminBase(cfg: AppConfig): string {
  return `${cfg.api.publicBaseUrl.replace(/\/+$/, "")}/admin`;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export function createStripeGateway(cfg: AppConfig): StripeGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async createCustomer({ tenantId, email, name }) {
      const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        metadata: { tenantId },
      });
      return { id: customer.id };
    },
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customer,
        customer_update: { address: "auto", name: "auto" },
        billing_address_collection: "required",
        payment_method_collection: "always",
        managed_payments: { enabled: true },
        line_items: [{ price: input.priceId, quantity: 1 }],
        subscription_data: {
          metadata: {
            tenantId: input.tenantId,
            packageCode: input.packageCode,
          },
        },
        client_reference_id: input.tenantId,
        metadata: {
          tenantId: input.tenantId,
          packageCode: input.packageCode,
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });
      return {
        url: session.url ?? "",
        customer: idOf(session.customer),
        subscription: idOf(session.subscription),
      };
    },
    async changePackage({ subscriptionId, priceId, packageCode }) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });
      const [first, ...rest] = subscription.items.data;
      if (!first) throw new Error("subscription has no items");
      await stripe.subscriptionItems.update(first.id, {
        price: priceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      });
      for (const item of rest) {
        await stripe.subscriptionItems.del(item.id, {
          proration_behavior: "create_prorations",
        });
      }
      await stripe.subscriptions.update(subscriptionId, {
        metadata: { ...subscription.metadata, packageCode },
      });
    },
    async createPortalSession({ customer, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: returnUrl,
        ...(cfg.stripe.portalConfigId ? { configuration: cfg.stripe.portalConfigId } : {}),
      });
      return { url: session.url };
    },
    async verifyWebhook({ payload, signature }) {
      const event = stripe.webhooks.constructEvent(payload, signature, cfg.stripe.webhookSecret);
      return event as unknown as StripeWebhookEvent;
    },
  };
}
