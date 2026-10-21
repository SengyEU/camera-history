import Stripe from "stripe";
import type { AppConfig } from "@ch/core";

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeGateway {
  createCustomer(input: { tenantId: string }): Promise<{ id: string }>;
  createCheckoutSession(input: {
    customer: string;
    priceIds: string[];
    tenantId: string;
    planMonths: number;
    trialPeriodDays?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; customer: string | null; subscription: string | null }>;
  createPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }>;
  verifyWebhook(input: { payload: string; signature: string }): Promise<StripeWebhookEvent>;
}

export function adminBase(cfg: AppConfig): string {
  return `${cfg.api.publicBaseUrl.replace(/\/+$/, "")}/admin`;
}

export function createStripeGateway(cfg: AppConfig): StripeGateway | null {
  if (!cfg.stripe.enabled || !cfg.stripe.secretKey) return null;
  const stripe = new Stripe(cfg.stripe.secretKey);
  return {
    async createCustomer({ tenantId }) {
      const customer = await stripe.customers.create({ metadata: { tenantId } });
      return { id: customer.id };
    },
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customer,
        line_items: input.priceIds.map((price) => ({ price })),
        subscription_data: {
          metadata: {
            tenantId: input.tenantId,
            planMonths: String(input.planMonths),
            trialClaimed: input.trialPeriodDays ? "1" : "0",
          },
          ...(input.trialPeriodDays ? { trial_period_days: input.trialPeriodDays } : {}),
        },
        client_reference_id: input.tenantId,
        metadata: {
          tenantId: input.tenantId,
          planMonths: String(input.planMonths),
          trialClaimed: input.trialPeriodDays ? "1" : "0",
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });
      const customer =
        typeof session.customer === "string" ? session.customer : String((session.customer as { id?: string } | null)?.id ?? "");
      const subscription =
        typeof session.subscription === "string" ? session.subscription : String((session.subscription as { id?: string } | null)?.id ?? "");
      return { url: session.url ?? "", customer, subscription };
    },
    async createPortalSession({ customer, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
      return { url: session.url };
    },
    async verifyWebhook({ payload, signature }) {
      const event = stripe.webhooks.constructEvent(payload, signature, cfg.stripe.webhookSecret);
      return event as unknown as StripeWebhookEvent;
    },
  };
}