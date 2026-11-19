import type { FastifyInstance } from "fastify";
import {
  HttpError,
  PACKAGE_TIERS,
  isPackageCode,
  packageForCode,
  packageForPriceId,
  priceIdForPackage,
} from "@ch/core";
import type { AppDeps } from "../app.js";
import { requireAuth } from "../plugins/auth.js";
import { adminBase } from "../stripe/gateway.js";

const RATE_LIMIT = { max: 300, timeWindow: "1 minute" };

function graceUntil(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

function configuredPrices(deps: AppDeps) {
  return PACKAGE_TIERS.map((tier) => ({
    code: tier.code,
    priceId: priceIdForPackage(deps.cfg.stripe.prices, tier.code) ?? "",
  })).filter((item) => item.priceId !== "");
}

export function registerBillingRoutes(app: FastifyInstance, deps: AppDeps) {
  const pre = requireAuth(app);

  async function applyPackage(
    tenant: NonNullable<Awaited<ReturnType<typeof deps.repos.getTenantById>>>,
    code: string,
    log?: { warn: (fields: Record<string, unknown>, message: string) => void },
  ) {
    if (!isPackageCode(code)) {
      throw new HttpError(400, "invalid_package", "packageCode must be one of solo, starter, plus, pro, network");
    }
    const tier = packageForCode(code)!;
    const cameraCount = await deps.repos.countCameras(tenant.id);
    if (cameraCount > tier.maxCameras) {
      log?.warn(
        {
          tenantId: tenant.id,
          packageCode: code,
          cameraCount,
          limit: tier.maxCameras,
        },
        "camera_limit_exceeded",
      );
      throw new HttpError(
        409,
        "camera_limit_exceeded",
        `Package ${tier.name} allows ${tier.maxCameras} cameras; this account has ${cameraCount}. Delete ${cameraCount - tier.maxCameras} camera(s) first.`,
      );
    }
    if (tenant.stripeSubscriptionId) {
      if (!deps.stripe) throw new HttpError(409, "billing_disabled", "stripe billing is not enabled");
      const priceId = priceIdForPackage(deps.cfg.stripe.prices, code);
      if (!priceId) {
        throw new HttpError(409, "billing_not_configured", "the package price is not configured");
      }
      await deps.stripe.changePackage({
        subscriptionId: tenant.stripeSubscriptionId,
        priceId,
        packageCode: code,
      });
    }
    await deps.repos.setBillingState(tenant.id, { packageCode: code });
    return code;
  }

  app.get("/api/v1/admin/billing", { preHandler: pre }, async (req) => {
    const tenant = await deps.repos.getTenantById(req.user!.tenantId);
    if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
    const cameraCount = await deps.repos.countCameras(tenant.id);
    const current = packageForCode(tenant.packageCode);
    const packages = PACKAGE_TIERS.map((tier) => ({
      code: tier.code,
      name: tier.name,
      maxCameras: tier.maxCameras,
      eurPerMonth: tier.eurPerMonth,
      current: tier.code === tenant.packageCode,
      available: cameraCount <= tier.maxCameras,
    }));

    return {
      packageCode: tenant.packageCode,
      packageName: current?.name ?? tenant.packageCode,
      cameraLimit: current?.maxCameras ?? 0,
      cameraCount,
      price: current?.eurPerMonth ?? null,
      monthlyTotal: current?.eurPerMonth ?? 0,
      billingStatus: tenant.billingStatus,
      stripeCustomerId: tenant.stripeCustomerId,
      hasSubscription: Boolean(tenant.stripeSubscriptionId),
      graceUntil: tenant.billingGraceUntil,
      isPilot: tenant.isPilot,
      pilotUntil: tenant.pilotUntil,
      billingEnabled: deps.cfg.stripe.enabled,
      pricesConfigured: configuredPrices(deps).length === PACKAGE_TIERS.length,
      packages,
    };
  });

  app.post(
    "/api/v1/admin/billing/package",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req) => {
      const body = (req.body ?? {}) as { packageCode?: unknown };
      const tenant = await deps.repos.getTenantById(req.user!.tenantId);
      if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
      const code = String(body.packageCode ?? "");
      const packageCode = await applyPackage(tenant, code, req.log);
      return { status: "ok", packageCode };
    },
  );

  app.post(
    "/api/v1/admin/billing/checkout",
    { preHandler: pre, config: { rateLimit: RATE_LIMIT } },
    async (req) => {
      if (!deps.stripe) throw new HttpError(409, "billing_disabled", "stripe billing is not enabled");
      const body = (req.body ?? {}) as { packageCode?: unknown };
      let tenant = await deps.repos.getTenantById(req.user!.tenantId);
      if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
      if (tenant.isPilot) {
        throw new HttpError(
          409,
          "pilot_account",
          "pilot accounts are free; ask us to switch the account to paid billing",
        );
      }
      if (body.packageCode !== undefined) {
        await applyPackage(tenant, String(body.packageCode), req.log);
        tenant = (await deps.repos.getTenantById(tenant.id))!;
      }
      if (tenant.stripeSubscriptionId) {
        throw new HttpError(409, "already_subscribed", "subscription already exists; use the package endpoint");
      }
      if ((await deps.repos.countCameras(tenant.id)) === 0) {
        throw new HttpError(409, "no_cameras", "add at least one camera before starting billing");
      }

      if (configuredPrices(deps).length !== PACKAGE_TIERS.length) {
        throw new HttpError(409, "billing_not_configured", "all five package prices must be configured");
      }
      const priceId = priceIdForPackage(deps.cfg.stripe.prices, tenant.packageCode);
      if (!priceId) {
        throw new HttpError(409, "billing_not_configured", "the package price is not configured");
      }

      let customerId = tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await deps.stripe.createCustomer({
          tenantId: tenant.id,
          email: req.user?.email,
          name: tenant.name,
        });
        customerId = customer.id;
        await deps.repos.setBillingState(tenant.id, { stripeCustomerId: customerId });
      }

      const base = adminBase(deps.cfg);
      const session = await deps.stripe.createCheckoutSession({
        customer: customerId,
        priceId,
        tenantId: tenant.id,
        packageCode: tenant.packageCode,
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
      const metaPackage =
        typeof metadata.packageCode === "string" && isPackageCode(metadata.packageCode)
          ? metadata.packageCode
          : null;

      if (event.type === "checkout.session.completed" && tenantId) {
        await deps.repos.setBillingState(tenantId, {
          stripeCustomerId: object.customer ? String(object.customer) : null,
          stripeSubscriptionId: object.subscription ? String(object.subscription) : null,
          billingStatus: "active",
          billingGraceUntil: null,
          ...(metaPackage ? { packageCode: metaPackage } : {}),
        });
      }

      if (event.type === "customer.subscription.updated" && tenantId) {
        const items = object.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
        const priceId = items?.data?.[0]?.price?.id;
        const fromPrice = priceId ? packageForPriceId(deps.cfg.stripe.prices, priceId) : null;
        const packageCode = fromPrice ?? metaPackage;
        const status = String(object.status ?? "");
        if (status === "active" || status === "trialing") {
          await deps.repos.setBillingState(tenantId, {
            billingStatus: "active",
            billingGraceUntil: null,
            ...(packageCode ? { packageCode } : {}),
          });
        } else if (status === "past_due" || status === "unpaid") {
          const current = await deps.repos.getTenantById(tenantId);
          const existingGrace =
            current?.billingStatus === "past_due" ? current.billingGraceUntil : null;
          await deps.repos.setBillingState(tenantId, {
            billingStatus: "past_due",
            billingGraceUntil: existingGrace ?? graceUntil(deps.cfg.billing.graceDays, new Date()),
            ...(packageCode ? { packageCode } : {}),
          });
        } else if (status === "canceled" || status === "incomplete_expired") {
          await deps.repos.setBillingState(tenantId, {
            billingStatus: "canceled",
            billingGraceUntil: null,
            stripeSubscriptionId: null,
            ...(packageCode ? { packageCode } : {}),
          });
        }
      }

      if (event.type === "customer.subscription.deleted" && tenantId) {
        await deps.repos.setBillingState(tenantId, {
          billingStatus: "canceled",
          billingGraceUntil: null,
          stripeSubscriptionId: null,
        });
      }

      return { received: true };
    });
  });
}
