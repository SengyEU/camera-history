import type { FastifyInstance } from "fastify";
import { HttpError, BILLING_TIERS, eurPerCamera, isValidPlanMonths, monthsForPriceId, priceIdForTier } from "@ch/core";
import type { AppDeps } from "../app.js";
import { requireAuth } from "../plugins/auth.js";
import { adminBase } from "../stripe/gateway.js";

const RATE_LIMIT = { max: 300, timeWindow: "1 minute" };

function graceUntil(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export function registerBillingRoutes(app: FastifyInstance, deps: AppDeps) {
  const pre = requireAuth(app);

  app.get("/api/v1/admin/billing", { preHandler: pre }, async (req) => {
    const tenant = await deps.repos.getTenantById(req.user!.tenantId);
    if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
    const cameraCount = await deps.repos.countCameras(tenant.id);
    const { usageBytes, spanDays } = await deps.repos.usageStats(tenant.id);
    const storageBytes =
      usageBytes > 0 && spanDays > 0
        ? Math.round((usageBytes / spanDays) * 30 * tenant.planMonths)
        : 0;
    return {
      planMonths: tenant.planMonths,
      price: eurPerCamera(tenant.planMonths),
      billingStatus: tenant.billingStatus,
      stripeCustomerId: tenant.stripeCustomerId,
      graceUntil: tenant.billingGraceUntil,
      cameraCount,
      usageBytes,
      storageBytes,
      billingEnabled: deps.cfg.stripe.enabled,
      tiers: BILLING_TIERS.map((t) => ({
        months: t.months,
        label: t.label,
        eurPerCamera: t.eurPerCamera,
        current: t.months === tenant.planMonths,
      })),
    };
  });

  app.post(
    "/api/v1/admin/billing/checkout",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req) => {
      if (!deps.stripe) throw new HttpError(409, "billing_disabled", "stripe billing is not enabled");
      const body = req.body as { planMonths?: unknown };
      const planMonths = Number(body.planMonths);
      if (!isValidPlanMonths(planMonths)) {
        throw new HttpError(400, "invalid_plan_months", "planMonths must be one of 0.5,1,3,6,12,24,36");
      }
      const priceId = priceIdForTier(deps.cfg.stripe.prices, planMonths);
      if (!priceId) throw new HttpError(400, "invalid_plan_months", "tier is not configured");

      const tenant = await deps.repos.getTenantById(req.user!.tenantId);
      if (!tenant) throw new HttpError(404, "not_found", "tenant not found");

      let customerId = tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await deps.stripe.createCustomer({ tenantId: tenant.id });
        customerId = customer.id;
        await deps.repos.setBillingState(tenant.id, { stripeCustomerId: customerId });
      }

      if (tenant.stripeSubscriptionId) {
        await deps.stripe.updateSubscription({ subscriptionId: tenant.stripeSubscriptionId, priceId });
        return { status: "ok" };
      }

      const base = adminBase(deps.cfg);
      const session = await deps.stripe.createCheckoutSession({
        customer: customerId,
        priceId,
        tenantId: tenant.id,
        planMonths,
        successUrl: `${base}/#/billing?paid=1`,
        cancelUrl: `${base}/#/billing?pay=cancelled`,
      });
      return { url: session.url };
    },
  );

  app.post(
    "/api/v1/admin/billing/portal",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req) => {
      if (!deps.stripe) throw new HttpError(409, "billing_disabled", "stripe billing is not enabled");
      const tenant = await deps.repos.getTenantById(req.user!.tenantId);
      if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
      if (!tenant.stripeCustomerId) throw new HttpError(409, "billing_not_started", "no stripe customer for tenant");
      const session = await deps.stripe.createPortalSession({
        customer: tenant.stripeCustomerId,
        returnUrl: `${adminBase(deps.cfg)}/#/billing`,
      });
      return { url: session.url };
    },
  );

  app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
      done(null, String(body));
    });

    scope.post("/api/v1/billing/webhook", async (req) => {
      if (!deps.stripe) {
        throw new HttpError(409, "billing_disabled", "stripe billing is not enabled");
      }
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string") {
        throw new HttpError(401, "invalid_signature", "missing stripe-signature header");
      }
      let event: { type: string; data: { object: Record<string, unknown> } };
      try {
        event = await deps.stripe.verifyWebhook({ payload: String(req.body), signature });
      } catch {
        throw new HttpError(401, "invalid_signature", "invalid signature");
      }

      const object = (event.data.object ?? {}) as Record<string, unknown>;
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      const tenantId = String(metadata.tenantId ?? "");

      if (event.type === "checkout.session.completed" && tenantId) {
        const planMonths = Number(metadata.planMonths);
        await deps.repos.setBillingState(tenantId, {
          stripeCustomerId: object.customer ? String(object.customer) : null,
          stripeSubscriptionId: object.subscription ? String(object.subscription) : null,
          billingStatus: "active",
          billingGraceUntil: null,
          ...(Number.isFinite(planMonths) ? { planMonths } : {}),
        });
        await deps.repos.setTenantCamerasEnabled(tenantId, true);
      }

      if (event.type === "customer.subscription.updated" && tenantId) {
        const status = String(object.status ?? "");
        const items = (object.items ?? {}) as Record<string, unknown>;
        const data = (Array.isArray(items.data) ? items.data : []) as Array<Record<string, unknown>>;
        const firstPrice = (data[0]?.price ?? {}) as Record<string, unknown>;
        const priceId = String(firstPrice.id ?? "");
        const months = priceId ? monthsForPriceId(deps.cfg.stripe.prices, priceId) : null;
        const patch = months !== null ? { planMonths: months } : {};
        if (status === "active" || status === "trialing") {
          await deps.repos.setBillingState(tenantId, { ...patch, billingStatus: "active", billingGraceUntil: null });
          await deps.repos.setTenantCamerasEnabled(tenantId, true);
        } else if (status === "past_due") {
          await deps.repos.setBillingState(tenantId, {
            ...patch,
            billingStatus: "past_due",
            billingGraceUntil: graceUntil(deps.cfg.billing.graceDays, new Date()),
          });
        } else if (status === "unpaid" || status === "canceled" || status === "incomplete_expired") {
          const billingStatus = status === "canceled" ? "canceled" : "unpaid";
          await deps.repos.setBillingState(tenantId, { ...patch, billingStatus, billingGraceUntil: null });
          await deps.repos.setTenantCamerasEnabled(tenantId, false);
        }
      }

      if (event.type === "customer.subscription.deleted" && tenantId) {
        await deps.repos.setBillingState(tenantId, { billingStatus: "canceled", billingGraceUntil: null });
        await deps.repos.setTenantCamerasEnabled(tenantId, false);
      }

      return { received: true };
    });
  });
}