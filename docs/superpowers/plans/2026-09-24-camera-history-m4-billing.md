# M4 — Billing: Stripe metered billing (per kamera) + self-serve tarify

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Build order constraint:** `@ch/core` je importován z dist ostatními balíčky (`exports.*` → `dist/`). Po jakékoli změně `packages/core/src/**` spusť `npm run build --workspace @ch/core` před testy/typecheck závislých balíčků (api, db, worker).

**Goal:** Stripe metered billing — per-kamera €/měsíc podle retenčního tieru, platební integrace v registraci, checkout upgrade/downgrade, Customer Portal, webhook syncing, worker (usage records + hard stop past_due) a admin Billing stránka.

**Architecture:** Stripe přes oficiální Node SDK, injektovaný jako `StripeGateway`/`MeteringGateway` (DI, žádné `vi.mock('stripe')` — viz G2 nižé). Sloupce billing na `tenants` (1:1), `plan_months integer → numeric(4,1)` (0.5 = 14 dní). Ceník (€/kamera/měsíc) jako konstanta v `@ch/core`, price-ids z env `STRIPE_PRICE_<MONTHS>`. Webhook bez auth (signature verify), checkout/portal server-redirect. Worker: UsageReportJob (metered usage, damení 1 h, agregace `last_value`) + GraceCheckJob (past_due + grace → deaktivace kamer).

**Tech Stack:** `stripe` SDK (^22, api+worker), Fastify routes, drizzle (pgEnum + numeric), Vitest, RTL.

## Global Constraints

- **G1 API kontrakt:** `POST /api/v1/billing/webhook` bez auth (Stripe-Signature), `GET /api/v1/admin/billing`, `POST /api/v1/admin/billing/checkout {planMonths}`, `POST /api/v1/admin/billing/portal`, `POST /api/v1/auth/register` (rozšířené o `billing` blok). Chyby RFC 7807: `billing_disabled` 409 (Stripe vypnut), `invalid_plan_months` 400, webhook bad sig 401, Stripe API error → `HttpError(502,'stripe_error',…)`.
- **G2 Testování Stripe:** DI falešných gateway (`defineFakeStripeGateway()`, `createFakeMeteringGateway()`) — žádné `vi.mock('stripe')`; gateway interface + falešné implementace definované v Task 3, použitelné v testech Task 4+5.
- **G3 Ceník (BillingTier):** `[{0.5,'14 dní',5},{1,'1 měsíc',9},{3,'3 měsíce',15},{6,'6 měsíců',22},{12,'12 měsíců',29},{24,'24 měsíců',49},{36,'36 měsíců',69}]`; whitelist tierů = tyto months. `plan_months` default 12.
- **G4 Hard stop:** past_due + grace 3 dny (`billing.graceDays` env `BILLING_GRACE_DAYS`) → `UPDATE cameras SET enabled=false WHERE tenant`; tenant → `unpaid`. Reaktivace jen webhookem `active`/`trialing` → `enabled=true` (per-kamera stav se neuchovává).
- **G5 Webhook idempotence:** upsert stavu podle tenantId z `metadata.tenantId` (checkout session metadata + `client_reference_id` + `subscription_data.metadata`); event retry = přepsání stejných hodnot (no-op).
- **G6 Metered price:** `billing_scheme: per_unit`, `recurring: { interval:'month', usage_type:'metered', aggregate_usage:'last_value' }`, EUR (cents). Usage quantity = aktuální počet kamer tenanta; damení reporty na 1 h na tenant (in-memory mapa workeru).
- **G7 `retentionCutoff`:** nové minimum `months >= 0.5` (dřív `>=1`); `0.5` → 14 dní (`setUTCDate(now-14)`), celé měsíce beze změny.
- **G8 Env (`.env.example` + loadConfig):** `STRIPE_ENABLED(false)`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_0_5/1/3/6/12/24/36` (price ids; prázdné vyneché), `BILLING_GRACE_DAYS(3)`. Stripe vypnut → plný provoz bez plateb, billing endpointy 409.
- **G9 `storageBytes` (GET billing):** `usageBytes = SUM(size_bytes)` celého tenanta (join images→cameras); `spanDays = ceil((last-first)/86400000)` (min 1, 0 když žádné snímky); `storageBytes = round(usageBytes/spanDays * 30 * planMonths)`.
- **G10 Admin URL pro checkout/portal:** `adminBase = cfg.api.publicBaseUrl.replace(/\/+$/,"") + "/admin"`; `success_url = {adminBase}/#/billing?paid=1`, `cancel_url = {adminBase}/#/billing?pay=cancelled`, portal `return_url = {adminBase}/#/billing`.
- **G11 Migrace 0002:** přes `drizzle-kit generate` (bez DB připojení); kontrola vygenerovaného SQL (viz Task 2). `packages/db/drizzle/meta` commitnuto (journal + snapshot).
- **G12 `stripe` SDK:** přidat `"stripe": "^22"` do dependencies `@ch/api` i `@ch/worker`; instalace z rootu (`npm install`).
- **G13 Worker tick:** `runBillingJobs` voláno v `tick()` po `runSchedule`; GraceCheckJob běží vždy, UsageReportJob jen když `metering && cfg.stripe.enabled`.
- **G14 Admin:** hash-based view `#/billing` (bez routeru), export `BillingPage` pro RTL testy; `api.ts` nové metody `getBilling/billingCheckout/billingPortal`.
- **G15 Repo gaty:** `npm run typecheck && npm run test && npm run lint` PASS; workspace identické (6 balíčků, žádný nový).

---

### Task 1: `@ch/core` — config (stripe/billing), ceník, `retentionCutoff` 0.5, typy

**Files:**
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/retention.ts:10-15`
- Modify: `packages/core/src/types.ts` (BillingStatus, BillingPatch, Tenant rozšířen)
- Create: `packages/core/src/billing.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/billing.test.ts` (new), `packages/core/test/retention.test.ts` (extend), `packages/core/test/config.test.ts` (extend)

**Interfaces:**
- Consumes: nic (první task).
- Produces:
  - `BILLING_TIERS: BillingTier[]`, `BillingTier { months: number; label: string; eurPerCamera: number }`
  - `isValidPlanMonths(months): boolean`, `eurPerCamera(months): number | null`, `priceIdForTier(prices: Record<string,string>, months): string | null`, `monthsForPriceId(prices, priceId): number | null`
  - `BillingStatus = "none"|"active"|"past_due"|"unpaid"|"canceled"`
  - `BillingPatch { stripeCustomerId?: string|null; stripeSubscriptionId?: string|null; billingStatus?: BillingStatus; billingGraceUntil?: Date|null; planMonths?: number }`
  - `Tenant` + `stripeCustomerId: string|null`, `stripeSubscriptionId: string|null`, `billingStatus: BillingStatus`, `billingGraceUntil: Date|null`
  - config: `stripe { enabled, secretKey, webhookSecret, prices: Record<string,string> }`, `billing { graceDays }`

- [ ] **Step 1: Write failing core tests**

Create `packages/core/test/billing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BILLING_TIERS,
  eurPerCamera,
  isValidPlanMonths,
  monthsForPriceId,
  priceIdForTier,
} from "../src/billing.js";

describe("billing catalog", () => {
  it("exposes the 7 approved tiers with eur and labels", () => {
    expect(BILLING_TIERS.map((t) => t.months)).toEqual([0.5, 1, 3, 6, 12, 24, 36]);
    expect(BILLING_TIERS[3]).toMatchObject({ label: "6 měsíců", eurPerCamera: 22 });
  });

  it("validates plan months against whitelist", () => {
    expect(isValidPlanMonths(12)).toBe(true);
    expect(isValidPlanMonths(0.5)).toBe(true);
    expect(isValidPlanMonths(7)).toBe(false);
    expect(isValidPlanMonths(0)).toBe(false);
  });

  it("looks up eur per camera", () => {
    expect(eurPerCamera(14)).toBeNull();
    expect(eurPerCamera(0.5)).toBe(5);
    expect(eurPerCamera(36)).toBe(69);
  });

  it("maps tier to price id and back", () => {
    const prices = { "12": "price_12", "0.5": "price_half" };
    expect(priceIdForTier(prices, 12)).toBe("price_12");
    expect(priceIdForTier(prices, 24)).toBeNull();
    expect(monthsForPriceId(prices, "price_half")).toBe(0.5);
    expect(monthsForPriceId(prices, "nope")).toBeNull();
  });
});
```

Append to `packages/core/test/retention.test.ts`:

```ts
  it("retentionCutoff supports 0.5 month as 14 days", () => {
    const r = retentionCutoff(0.5, new Date("2026-09-18T00:00:00Z"));
    expect(r.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("retentionCutoff throws below 0.5", () => {
    expect(() => retentionCutoff(0.4, new Date())).toThrow(RangeError);
  });
```

Append to `packages/core/test/config.test.ts`:

```ts
  it("loads stripe and billing config", () => {
    const cfg = loadConfig({
      STRIPE_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_y",
      STRIPE_PRICE_0_5: "price_half",
      STRIPE_PRICE_12: "price_12",
      BILLING_GRACE_DAYS: "5",
    });
    expect(cfg.stripe).toMatchObject({
      enabled: true,
      secretKey: "sk_test_x",
      webhookSecret: "whsec_y",
      prices: { "0.5": "price_half", "12": "price_12" },
    });
    expect(cfg.billing.graceDays).toBe(5);
  });

  it("defaults stripe to disabled with empty prices", () => {
    const cfg = loadConfig({});
    expect(cfg.stripe.enabled).toBe(false);
    expect(cfg.stripe.prices).toEqual({});
    expect(cfg.billing.graceDays).toBe(3);
  });
```

- [ ] **Step 2: Run core tests, verify they fail**

Run: `npm run test --workspace @ch/core`
Expected: `billing.test.ts` FAIL (module `../src/billing.js` neexistuje), retention/config assertions FAIL (stará `retentionCutoff` hází pro 0.5, config nemá stripe/billing).

- [ ] **Step 3: Implement `billing.ts`, config, retention, types**

Create `packages/core/src/billing.ts`:

```ts
export interface BillingTier {
  months: number;
  label: string;
  eurPerCamera: number;
}

export const BILLING_TIERS: BillingTier[] = [
  { months: 0.5, label: "14 dní", eurPerCamera: 5 },
  { months: 1, label: "1 měsíc", eurPerCamera: 9 },
  { months: 3, label: "3 měsíce", eurPerCamera: 15 },
  { months: 6, label: "6 měsíců", eurPerCamera: 22 },
  { months: 12, label: "12 měsíců", eurPerCamera: 29 },
  { months: 24, label: "24 měsíců", eurPerCamera: 49 },
  { months: 36, label: "36 měsíců", eurPerCamera: 69 },
];

export function isValidPlanMonths(months: number): boolean {
  return BILLING_TIERS.some((t) => t.months === months);
}

export function eurPerCamera(months: number): number | null {
  return BILLING_TIERS.find((t) => t.months === months)?.eurPerCamera ?? null;
}

export function priceIdForTier(prices: Record<string, string>, months: number): string | null {
  const id = prices[String(months)];
  return id && id !== "" ? id : null;
}

export function monthsForPriceId(prices: Record<string, string>, priceId: string): number | null {
  for (const [key, value] of Object.entries(prices)) {
    if (value === priceId) {
      const months = Number(key);
      if (Number.isFinite(months)) return months;
    }
  }
  return null;
}
```

Modify `packages/core/src/types.ts` — add `BillingStatus`/`BillingPatch`, extend `Tenant`:

```ts
export type BillingStatus = "none" | "active" | "past_due" | "unpaid" | "canceled";

export interface BillingPatch {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  billingStatus?: BillingStatus;
  billingGraceUntil?: Date | null;
  planMonths?: number;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  planMonths: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: BillingStatus;
  billingGraceUntil: Date | null;
}
```

Modify `packages/core/src/retention.ts` (funkce `retentionCutoff`):

```ts
export function retentionCutoff(months: number, now: Date = new Date()): Date {
  if (months < 0.5) throw new RangeError("months must be >= 0.5");
  const d = new Date(now);
  if (months === 0.5) {
    d.setUTCDate(d.getUTCDate() - 14);
    return d;
  }
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}
```

Modify `packages/core/src/config.ts` — do sekce objektu `AppConfigSchema` přidej:

```ts
  stripe: z.object({
    enabled: boolean(false),
    secretKey: z.string().default(""),
    webhookSecret: z.string().default(""),
    prices: z.record(z.string(), z.string()).default({}),
  }),
  billing: z.object({
    graceDays: numeric(3),
  }),
```

Mimo `AppConfigSchema` přidej helper a rozšiř `loadConfig`:

```ts
const PRICE_ENV_KEYS = ["0_5", "1", "3", "6", "12", "24", "36"] as const;

function pricesFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PRICE_ENV_KEYS) {
    const value = env[`STRIPE_PRICE_${k}`];
    if (typeof value === "string" && value !== "") out[k.replace("_", ".")] = value;
  }
  return out;
}
```

V `loadConfig` return objektu přidej:

```ts
    stripe: {
      enabled: env.STRIPE_ENABLED,
      secretKey: env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
      prices: pricesFromEnv(env),
    },
    billing: { graceDays: env.BILLING_GRACE_DAYS },
```

Modify `packages/core/src/index.ts`:

```ts
export * from "./billing.js";
```

- [ ] **Step 4: Rebuild core + run tests, verify pass**

Run:
```bash
npm run build --workspace @ch/core
npm run test --workspace @ch/core
```
Expected: ALL PASS (billing.test.ts 4 cases, retention 0.5 cases, config stripe/billing cases + stávající).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "feat(core): billing tiers, stripe config, retentionCutoff 0.5, Tenant billing fields"
```

---

### Task 2: `@ch/db` — schema + migrace 0002 + repo funkce + fakeRepos

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/repos.types.ts`
- Modify: `packages/db/src/repos.ts`
- Modify: `packages/db/src/testing/fakeRepos.ts`
- Create (generate): `packages/db/drizzle/0002_*.sql`, `0002_*.snapshot.json`, journal úprava (přes `npm run db:generate --workspace @ch/db`)
- Test: `packages/db/test/fakeRepos.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 (`Tenant` rozšířen, `BillingPatch`, `BillingStatus`, `BillingTier` nemá repo vazbu).
- Produces (rozšíření `Repos`):
  - `countCameras(tenantId): Promise<number>`
  - `usageStats(tenantId): Promise<{ usageBytes: number; spanDays: number }>`
  - `setTenantCamerasEnabled(tenantId, enabled: boolean): Promise<void>`
  - `setBillingState(tenantId, patch: BillingPatch): Promise<Tenant | null>`
  - `listTenantsByBillingStatus(status: BillingStatus): Promise<Tenant[]>`

- [ ] **Step 1: Modify schema, repos, fakeRepos (tests in Step 3)**

Modify `packages/db/src/schema.ts` — import + enum + sloupce:

```ts
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  time,
  uniqueIndex,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

export const billingStatusEnum = pgEnum("billing_status", ["none", "active", "past_due", "unpaid", "canceled"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  planMonths: numeric("plan_months", { precision: 4, scale: 1, mode: "number" })
    .notNull()
    .default(12),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingStatus: billingStatusEnum("billing_status").notNull().default("none"),
  billingGraceUntil: timestamp("billing_grace_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tenants_slug_unique").on(t.slug),
]);
```

Modify `packages/db/src/repos.types.ts` — importy + metody:

```ts
import type {
  BillingPatch,
  BillingStatus,
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  Tenant,
  User,
} from "@ch/core";

export interface Repos {
  createTenant(input: NewTenant): Promise<Tenant>;
  getTenantById(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  createUser(input: NewUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  createCamera(tenantId: string, input: NewCamera): Promise<Camera>;
  getCameraById(id: string): Promise<Camera | null>;
  listCameras(tenantId: string): Promise<Camera[]>;
  updateCamera(id: string, patch: CameraPatch): Promise<Camera | null>;
  deleteCamera(id: string): Promise<void>;
  listEnabledCameras(): Promise<Camera[]>;
  getPublicCamera(cameraId: string): Promise<PublicCamera | null>;
  insertImage(input: NewImage): Promise<ImageRecord>;
  imagesForCameraDay(cameraId: string, from: Date, to: Date): Promise<ImageRecord[]>;
  getImageById(id: string): Promise<ImageRecord | null>;
  latestImageForCamera(cameraId: string): Promise<ImageRecord | null>;
  countCameras(tenantId: string): Promise<number>;
  usageStats(tenantId: string): Promise<{ usageBytes: number; spanDays: number }>;
  setTenantCamerasEnabled(tenantId: string, enabled: boolean): Promise<void>;
  setBillingState(tenantId: string, patch: BillingPatch): Promise<Tenant | null>;
  listTenantsByBillingStatus(status: BillingStatus): Promise<Tenant[]>;
}
```

Modify `packages/db/src/repos.ts` — import `sql` z drizzle-orm a přidej metody do `createRepos` return objektu:

```ts
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
```

```ts
    async countCameras(tenantId: string) {
      const rows = await db.select({ id: cameras.id }).from(cameras).where(eq(cameras.tenantId, tenantId));
      return rows.length;
    },
    async usageStats(tenantId: string) {
      const [row] = await db
        .select({
          bytes: sql<number>`COALESCE(SUM(${images.sizeBytes}), 0)`,
          first: sql<Date | null>`MIN(${images.timestamp})`,
          last: sql<Date | null>`MAX(${images.timestamp})`,
        })
        .from(images)
        .innerJoin(cameras, eq(images.cameraId, cameras.id))
        .where(eq(cameras.tenantId, tenantId));
      if (!row || row.bytes === 0) return { usageBytes: 0, spanDays: 0 };
      const first = row.first;
      const last = row.last;
      if (!first || !last) return { usageBytes: Number(row.bytes), spanDays: 0 };
      const spanDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86_400_000));
      return { usageBytes: Number(row.bytes), spanDays };
    },
    async setTenantCamerasEnabled(tenantId: string, enabled: boolean) {
      await db.update(cameras).set({ enabled }).where(eq(cameras.tenantId, tenantId));
    },
    async setBillingState(tenantId: string, patch: BillingPatch) {
      const [row] = await db.update(tenants).set(patch).where(eq(tenants.id, tenantId)).returning();
      return row ?? null;
    },
    async listTenantsByBillingStatus(status: BillingStatus) {
      return db.select().from(tenants).where(eq(tenants.billingStatus, status));
    },
```

Modify `packages/db/src/testing/fakeRepos.ts` — import `BillingPatch`, `BillingStatus`; `createTenant` plň nové defaulty; přidej metody:

```ts
import type {
  BillingPatch,
  BillingStatus,
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  Tenant,
  User,
} from "@ch/core";
```

V `createTenant`:

```ts
      const tenant: Tenant = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        planMonths: input.planMonths ?? 12,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingStatus: "none",
        billingGraceUntil: null,
      };
```

Nové metody v return objektu:

```ts
    async countCameras(tenantId: string) {
      return db.cameras.filter((c) => c.tenantId === tenantId).length;
    },
    async usageStats(tenantId: string) {
      const cameraIds = new Set(db.cameras.filter((c) => c.tenantId === tenantId).map((c) => c.id));
      const owned = db.images.filter((i) => cameraIds.has(i.cameraId));
      if (owned.length === 0) return { usageBytes: 0, spanDays: 0 };
      const usageBytes = owned.reduce((sum, i) => sum + i.sizeBytes, 0);
      const times = owned.map((i) => i.timestamp.getTime());
      const spanDays = Math.max(1, Math.ceil((Math.max(...times) - Math.min(...times)) / 86_400_000));
      return { usageBytes, spanDays };
    },
    async setTenantCamerasEnabled(tenantId: string, enabled: boolean) {
      for (let i = 0; i < db.cameras.length; i += 1) {
        if (db.cameras[i]!.tenantId === tenantId) db.cameras[i] = { ...db.cameras[i]!, enabled };
      }
    },
    async setBillingState(tenantId: string, patch: BillingPatch) {
      const idx = db.tenants.findIndex((t) => t.id === tenantId);
      if (idx === -1) return null;
      const updated: Tenant = { ...db.tenants[idx]!, ...patch, id: tenantId };
      db.tenants[idx] = updated;
      return updated;
    },
    async listTenantsByBillingStatus(status: BillingStatus) {
      return db.tenants.filter((t) => t.billingStatus === status);
    },
```

- [ ] **Step 2: Generate migration 0002**

Run: `npm run db:generate --workspace @ch/db`
Expected: vytvoří `packages/db/drizzle/0002_*.sql` + `0002_*.snapshot.json` + upraví `_journal.json`. Zkontroluj SQL:

```bash
ls packages/db/drizzle/0002_*.sql
cat packages/db/drizzle/0002_*.sql
```

Očekávaný obsah (přibližně):

```sql
CREATE TYPE "public"."billing_status" AS ENUM('none', 'active', 'past_due', 'unpaid', 'canceled');--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "plan_months" SET DATA TYPE numeric(4,1);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_status" "billing_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_grace_until" timestamp with time zone;
```

Pokud `drizzle-kit generate` selže (např. offline), napiš soubor ručně se stejným SQL a doplň snapshot+journal (viz stávající `0001` vzor; journal `idx:2`, tag `0002_<random>`).

- [ ] **Step 3: Extend + run db tests**

Append do `packages/db/test/fakeRepos.test.ts`:

```ts
  it("counts cameras and reports usage stats for a tenant", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const cam = await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.insertImage({ cameraId: cam.id, timestamp: new Date("2026-09-18T09:00:00Z"), storageKey: "k1", sizeBytes: 100 });
    await repos.insertImage({ cameraId: cam.id, timestamp: new Date("2026-09-20T09:00:00Z"), storageKey: "k2", sizeBytes: 150 });
    expect(await repos.countCameras(tenant.id)).toBe(1);
    expect(await repos.usageStats(tenant.id)).toEqual({ usageBytes: 250, spanDays: 2 });
    expect(await repos.usageStats("missing")).toEqual({ usageBytes: 0, spanDays: 0 });
  });

  it("enables/disables all tenant cameras and toggles billing state", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const cam = await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.setTenantCamerasEnabled(tenant.id, false);
    expect(repos.db.cameras[0]!.enabled).toBe(false);
    await repos.setBillingState(tenant.id, { billingStatus: "past_due", billingGraceUntil: new Date("2026-10-01T00:00:00Z") });
    expect(repos.db.tenants[0]!.billingStatus).toBe("past_due");
    const listed = await repos.listTenantsByBillingStatus("past_due");
    expect(listed.map((t) => t.id)).toContain(tenant.id);
  });
```

Run:
```bash
npm run build --workspace @ch/core
npm run test --workspace @ch/db
npm run typecheck --workspace @ch/db
```
Expected: db tests PASS (fakeRepos + storage), typecheck PASS.

- [ ] **Step 4: Repo gates (kotrola: api/worker zatím nezměněny — ale typecheck napříč nebude běžet bez rozšíření testConfig, to je Task 4)**

Run: `npm run typecheck`
Expected: FAIL na `packages/worker/test/captureRun.test.ts` a `packages/api/test/helpers.ts` (AppConfig literály bez `stripe`/`billing`). To je očekávané — opraví Task 4. **Neblokuje commit Task 2.**

- [ ] **Step 5: Commit**

```bash
git add packages/db/src packages/db/drizzle packages/db/test
git commit -m "feat(db): billing columns, migration 0002, billing repo functions"
```

---

### Task 3: `@ch/api` — `StripeGateway` interface + `createStripeGateway` (DI), test helpers s fake

**Files:**
- Create: `packages/api/src/stripe/gateway.ts`
- Modify: `packages/api/src/app.ts` (AppDeps + `stripe`)
- Modify: `packages/api/src/server.ts` (vytvoř gateway)
- Modify: `packages/api/test/helpers.ts` (testConfig rozšíř + `defineFakeStripeGateway`)
- Test: `packages/api/test/billing.gateway.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 config.
- Produces:
  - `StripeGateway` interface:
    ```ts
    interface StripeGateway {
      createCustomer(input: { tenantId: string }): Promise<{ id: string }>;
      createCheckoutSession(input: { customer: string; priceId: string; tenantId: string; planMonths: number; successUrl: string; cancelUrl: string }): Promise<{ url: string; customer: string | null; subscription: string | null }>;
      updateSubscription(input: { subscriptionId: string; priceId: string }): Promise<void>;
      createPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }>;
      verifyWebhook(input: { payload: string; signature: string }): Promise<StripeWebhookEvent>;
    }
    ```
  - `StripeWebhookEvent { type: string; data: { object: Record<string, unknown> } }`
  - `createStripeGateway(cfg): StripeGateway | null` (null když disabled/bez secretKey)
  - `adminBase(cfg): string` (G10)
  - AppDeps + `stripe: StripeGateway | null`
  - test: `defineFakeStripeGateway(over?: Partial<StripeGateway>): StripeGateway` — vi.fn proxy s výchovnými response.

- [ ] **Step 1: Write failing gateway test**

Create `packages/api/test/billing.gateway.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { adminBase, createStripeGateway } from "../src/stripe/gateway.js";

describe("adminBase", () => {
  it("builds admin url from public base url", () => {
    expect(adminBase({ api: { publicBaseUrl: "https://camera.sengycraft.cz/" }, } as never)).toBe(
      "https://camera.sengycraft.cz/admin",
    );
    expect(adminBase({ api: { publicBaseUrl: "http://localhost:8080" }, } as never)).toBe(
      "http://localhost:8080/admin",
    );
  });
});

describe("createStripeGateway", () => {
  it("returns null when stripe disabled or secret missing", () => {
    expect(createStripeGateway({ stripe: { enabled: false, secretKey: "sk_test" } } as never)).toBeNull();
    expect(createStripeGateway({ stripe: { enabled: true, secretKey: "" } } as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test --workspace @ch/api -- billing.gateway`
Expected: FAIL — `src/stripe/gateway.js` neexistuje.

- [ ] **Step 3: Implement gateway + DI in app/server + helpers**

Create `packages/api/src/stripe/gateway.ts`:

```ts
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
    priceId: string;
    tenantId: string;
    planMonths: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; customer: string | null; subscription: string | null }>;
  updateSubscription(input: { subscriptionId: string; priceId: string }): Promise<void>;
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
        line_items: [{ price: input.priceId, quantity: 1 }],
        subscription_data: {
          metadata: { tenantId: input.tenantId, planMonths: String(input.planMonths) },
        },
        client_reference_id: input.tenantId,
        metadata: { tenantId: input.tenantId, planMonths: String(input.planMonths) },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });
      return { url: session.url ?? "", customer: session.customer, subscription: session.subscription };
    },
    async updateSubscription({ subscriptionId, priceId }) {
      const items = await stripe.subscriptionItems.list({ subscription: subscriptionId, limit: 1 });
      const item = items.data[0];
      if (!item) throw new Error("no subscription item");
      await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: item.id, price: priceId }],
      });
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
```

Poznámka: statický `import Stripe from "stripe"` funguje pod `module: NodeNext` + `esModuleInterop` (CJS default import). Gateway se konstruuje jen při `enabled`.

> **Závislost (nutná před typecheck/test Task 3):** přidej `"stripe": "^22"` do `dependencies` v `packages/api/package.json` i `packages/worker/package.json` a spusť z rootu `npm install`. Bez instalace selže `npm run typecheck --workspace @ch/api` na chybějícím modulu.

Modify `packages/api/src/app.ts` — AppDeps + buildApp:

```ts
import type { StripeGateway } from "./stripe/gateway.js";

export interface AppDeps {
  cfg: AppConfig;
  repos: Repos;
  storage: ObjectStorage;
  stripe: StripeGateway | null;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie);
  app.register(jwt, { secret: deps.cfg.jwt.secret });
  app.register(rateLimit, { global: false, max: 300, timeWindow: "1 minute" });

  app.setErrorHandler(errorHandler);

  app.register(registerAuthRoutes, deps);
  app.register(registerAdminRoutes, deps);
  app.register(registerBillingRoutes, deps);
  app.register(registerPublicRoutes, deps);

  return app;
}
```

(import `registerBillingRoutes` vznikne v Task 4 — pokud build Task 3 ře ochutnává na fork routes, commit Task 3 až po vytvoření prázdného stubu – viz poznámka.)

> Poznámka k pořadí: `registerBillingRoutes` přidá Task 4. Pro to, aby Task 3 skončil zelený commitovatelný stav, přidej v Task 3 zároveň minimální stub `packages/api/src/routes/billing.ts` (viz Task 4 Step 3 kostru bez logiky) a import v `app.ts`. Task 4 ho pak naplní. Varianta: sloučit Task 3 a 4 do jednoho commitu — doporučená (viz Task 4 Step 1).

Vzhledem k provázanosti sluč Task 3 a Task 4 do jednoho commit cyklu: **Task 3+4 = API stripe modul + routes + webhook + tests** (commit až po zeleném `npm run test --workspace @ch/api`).

Modify `packages/api/src/server.ts`:

```ts
import { createStripeGateway } from "./stripe/gateway.js";

const config = loadConfig(process.env);
const stripe = createStripeGateway(config);
const app = buildApp({ cfg: config, repos, storage, stripe });
```

(result: pass `stripe`.)

Modify `packages/api/test/helpers.ts` — rozšiř testConfig a přidej fake gateway:

```ts
import type { StripeGateway } from "../src/stripe/gateway.js";

export const testConfig: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
  stripe: { enabled: false, secretKey: "", webhookSecret: "", prices: {} },
  billing: { graceDays: 3 },
};

export function defineFakeStripeGateway(over: Partial<StripeGateway> = {}): StripeGateway {
  return {
    createCustomer: over.createCustomer ?? (async () => ({ id: "cus_123" })),
    createCheckoutSession:
      over.createCheckoutSession ??
      (async () => ({ url: "https://checkout.stripe.com/test", customer: "cus_123", subscription: "sub_123" })),
    updateSubscription: over.updateSubscription ?? (async () => undefined),
    createPortalSession: over.createPortalSession ?? (async () => ({ url: "https://billing.stripe.com/test" })),
    verifyWebhook: over.verifyWebhook ?? (async () => ({ type: "customer.subscription.updated", data: { object: { metadata: { tenantId: "" } } } })),
  };
}

export function makeApp(overrides: {
  repos?: Repos;
  storage?: ObjectStorage;
  cfg?: AppConfig;
  stripe?: StripeGateway | null;
} = {}) {
  const fakes = createFakeRepos();
  const repos = overrides.repos ?? fakes;
  const storage = overrides.storage ?? {
    get: async (key: string) => Buffer.from(`bytes:${key}`) as unknown as Buffer,
    put: async () => undefined,
  };
  const cfg = overrides.cfg ?? testConfig;
  const app = buildApp({
    cfg,
    repos,
    storage,
    stripe: overrides.stripe !== undefined ? overrides.stripe : null,
  });
  return { app, repos };
}
```

> Poznámka: `ObjectStorage` má `put` i `get`; rozšiř default storage o `put`. Stávající testy nezávisí na `stripe` (null default).

- [ ] **Step 4: Run api tests + typecheck**

Run:
```bash
npm run build --workspace @ch/core
npm run test --workspace @ch/api
npm run typecheck --workspace @ch/api
```
Expected: PASS (auth/admin/public/retention), gateway test PASS.

- [ ] **Step 5 (rozšířit Task 4, commit zde po Task 4)**

Commit zahrne Task 4 (viz Task 4 Step 5).

---

### Task 4: `@ch/api` — billing routes + webhook + register rozšířit + tests

**Files:**
- Create: `packages/api/src/routes/billing.ts`
- Modify: `packages/api/src/app.ts` (import `registerBillingRoutes` — viz Task 3)
- Modify: `packages/api/src/routes/auth.ts` (register rozšířit)
- Test: `packages/api/test/billing.test.ts` (new), `packages/api/test/auth.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 (BILLING_TIERS, isValidPlanMonths, priceIdForTier, monthsForPriceId, BillingPatch, HttpError), Task 2 (repos billing metody), Task 3 (StripeGateway, adminBase).
- Produces:
  - `registerBillingRoutes(app: FastifyInstance, deps: AppDeps)` — GET/checkout/portal (auth via `requireAuth`) + webhook (bez auth, raw body + signature)
  - register response: `{ status, tenantId }` + (když stripe enabled) `billing: { required: true, checkoutUrl }`

- [ ] **Step 1: Write failing billing route tests**

Create `packages/api/test/billing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defineFakeStripeGateway, makeApp, testConfig } from "./helpers.js";

async function registerAndLogin(app: ReturnType<typeof makeApp>["app"]) {
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "a@acme.cz", password: "password123" },
  });
  return (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!).join("; ");
}

describe("billing endpoints", () => {
  it("returns billing summary with stripe disabled", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/billing", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().billingEnabled).toBe(false);
    await (app as { close: () => Promise<void> }).close();
  });

  it("returns billing summary for a tenant", async () => {
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12" } } },
      stripe: defineFakeStripeGateway(),
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const cam = await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.insertImage({ cameraId: cam.id, timestamp: new Date("2026-09-18T09:00:00Z"), storageKey: "k", sizeBytes: 120 });
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/billing", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.billingEnabled).toBe(true);
    expect(body.planMonths).toBe(12);
    expect(body.price).toBe(29);
    expect(body.cameraCount).toBe(1);
    expect(body.usageBytes).toBe(120);
    expect(Array.isArray(body.tiers) && body.tiers.length).toBe(7);
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects invalid plan months on checkout", async () => {
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12" } } },
      stripe: defineFakeStripeGateway(),
    });
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST", url: "/api/v1/admin/billing/checkout", headers: { cookie },
      payload: { planMonths: 7 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("invalid_plan_months");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects checkout when stripe is off", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST", url: "/api/v1/admin/billing/checkout", headers: { cookie },
      payload: { planMonths: 12 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("billing_disabled");
    await (app as { close: () => Promise<void> }).close();
  });

  it("creates checkout session for a new subscription", async () => {
    const created: Array<Record<string, unknown>> = [];
    const gateway = defineFakeStripeGateway({
      createCheckoutSession: async (input) => {
        created.push(input as unknown as Record<string, unknown>);
        return { url: "https://checkout.stripe.com/sess", customer: "cus_123", subscription: null };
      },
    });
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "24": "price_24" } } },
      stripe: gateway,
    });
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST", url: "/api/v1/admin/billing/checkout", headers: { cookie },
      payload: { planMonths: 24 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("https://checkout.stripe.com/sess");
    expect(created[0]).toMatchObject({ priceId: "price_24", planMonths: 24 });
    await (app as { close: () => Promise<void> }).close();
  });

  it("updates an existing subscription price", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const gateway = defineFakeStripeGateway({
      updateSubscription: async (input) => {
        calls.push(input as unknown as Record<string, unknown>);
      },
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12", "3": "price_3" } } },
      stripe: gateway,
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_existing", billingStatus: "active" });
    const res = await app.inject({
      method: "POST", url: "/api/v1/admin/billing/checkout", headers: { cookie },
      payload: { planMonths: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
    expect(calls[0]).toMatchObject({ subscriptionId: "sub_existing", priceId: "price_3" });
    await (app as { close: () => Promise<void> }).close();
  });

  it("opens portal session", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true } },
      stripe: gateway,
    });
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeCustomerId: "cus_123" });
    const res = await app.inject({ method: "POST", url: "/api/v1/admin/billing/portal", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("https://billing.stripe.com/test");
    await (app as { close: () => Promise<void> }).close();
  });
});

describe("billing webhook", () => {
  const sig = "t=1812,v1=whatever";

  it("returns 401 on invalid signature", async () => {
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => {
        throw new Error("bad signature");
      },
    });
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(401);
    await (app as { close: () => Promise<void> }).close();
  });

  it("syncs checkout.session.completed", async () => {
    const gateway = defineFakeStripeGateway();
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    gateway.verifyWebhook = async () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { tenantId: tenant.id, planMonths: "24" },
          customer: "cus_new",
          subscription: "sub_new",
        },
      },
    });
    await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    void token;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: JSON.stringify({ tenantId: tenant.id }),
    });
    expect(res.statusCode).toBe(200);
    const after = (await repos.getTenantById(tenant.id))!;
    expect(after).toMatchObject({
      stripeCustomerId: "cus_new",
      stripeSubscriptionId: "sub_new",
      billingStatus: "active",
      planMonths: 24,
    });
    expect(repos.db.cameras[0]!.enabled).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

  it("sets past_due with grace then disables cameras on unpaid", async () => {
    const events: Array<{ type: string; object: Record<string, unknown> }> = [];
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => {
        const e = events.shift()!;
        return { type: e.type, data: { object: e.object } };
      },
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_1", billingStatus: "active" });
    await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    void token;

    events.push({ type: "customer.subscription.updated", object: { metadata: { tenantId: tenant.id }, status: "past_due" } });
    const past = await app.inject({
      method: "POST", url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(past.statusCode).toBe(200);
    const pastDue = (await repos.getTenantById(tenant.id))!;
    expect(pastDue.billingStatus).toBe("past_due");
    expect(pastDue.billingGraceUntil && pastDue.billingGraceUntil.getTime()).toBeGreaterThan(Date.now());

    events.push({ type: "customer.subscription.updated", object: { metadata: { tenantId: tenant.id }, status: "unpaid" } });
    const unpaid = await app.inject({
      method: "POST", url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(unpaid.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("unpaid");
    expect(repos.db.cameras[0]!.enabled).toBe(false);
    await (app as { close: () => Promise<void> }).close();
  });

  it("reactivates cameras on active subscription", async () => {
    const events: Array<{ type: string; object: Record<string, unknown> }> = [];
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => {
        const e = events.shift()!;
        return { type: e.type, data: { object: e.object } };
      },
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_2", billingStatus: "past_due" });
    await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.setTenantCamerasEnabled(tenant.id, false);
    void token;

    events.push({
      type: "customer.subscription.updated",
      object: { metadata: { tenantId: tenant.id }, status: "active", items: { data: [{ price: { id: "price_12" } }] } },
    });
    const res = await app.inject({
      method: "POST", url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("active");
    expect(repos.db.cameras[0]!.enabled).toBe(true);
    await (app as { close: () => Promise<void> }).close();
  });

it("marks tenant canceled and disables cameras on deleted", async () => {
    const gateway = defineFakeStripeGateway({
      verifyWebhook: async () => ({
        type: "customer.subscription.deleted",
        data: { object: { metadata: { tenantId: tenant.id } } },
      }),
    });
    const { app, repos } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, webhookSecret: "whsec_test" } },
      stripe: gateway,
    });
    const token = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    await repos.setBillingState(tenant.id, { stripeSubscriptionId: "sub_3", billingStatus: "active" });
    await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    void token;
    const res = await app.inject({
      method: "POST", url: "/api/v1/billing/webhook",
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(200);
    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("canceled");
    expect(repos.db.cameras[0]!.enabled).toBe(false);
    await (app as { close: () => Promise<void> }).close();
  });
```

> Poznámka: v testech webhoku může closure gateway odkazovat na `tenant` deklarovaný až po `makeApp`/`registerAndLogin` — je to safe, protože `verifyWebhook` se vykoná až při `app.inject` (po přiřazení `tenant`).

- [ ] **Step 2: Run tests, verify fail**

Run: `npm run test --workspace @ch/api -- billing`
Expected: FAIL — `src/routes/billing.js` neexistuje (import ve `app.ts`, Task 3 stub).

- [ ] **Step 3: Implement `routes/billing.ts`**

Create `packages/api/src/routes/billing.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { HttpError, monthsForPriceId, eurPerCamera, isValidPlanMonths, priceIdForTier, BILLING_TIERS } from "@ch/core";
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

  app.post("/api/v1/admin/billing/checkout", { preHandler: pre, config: { rateLimit: RATE_LIMIT } }, async (req) => {
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
  });

  app.post("/api/v1/admin/billing/portal", { preHandler: pre, config: { rateLimit: RATE_LIMIT } }, async (req) => {
    if (!deps.stripe) throw new HttpError(409, "billing_disabled", "stripe billing is not enabled");
    const tenant = await deps.repos.getTenantById(req.user!.tenantId);
    if (!tenant) throw new HttpError(404, "not_found", "tenant not found");
    if (!tenant.stripeCustomerId) throw new HttpError(409, "billing_not_started", "no stripe customer for tenant");
    const session = await deps.stripe.createPortalSession({
      customer: tenant.stripeCustomerId,
      returnUrl: `${adminBase(deps.cfg)}/#/billing`,
    });
    return { url: session.url };
  });

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
```

Modify `packages/api/src/app.ts` — přidej import (viz Task 3; merge s Task 3):

```ts
import { registerBillingRoutes } from "./routes/billing.js";
```

Modify `packages/api/src/routes/auth.ts` — rozšiř register (po `createUser`, před sign/response). Přidej:

```ts
    let billing: { required: boolean; checkoutUrl?: string } | undefined;
    if (deps.stripe) {
      const customer = await deps.stripe.createCustomer({ tenantId: tenant.id });
      await deps.repos.setBillingState(tenant.id, { stripeCustomerId: customer.id });
      const priceId = priceIdForTier(deps.cfg.stripe.prices, deps.cfg.plan.defaultRetentionMonths);
      if (priceId) {
        const base = adminBase(deps.cfg);
        const session = await deps.stripe.createCheckoutSession({
          customer: customer.id,
          priceId,
          tenantId: tenant.id,
          planMonths: deps.cfg.plan.defaultRetentionMonths,
          successUrl: `${base}/#/billing?paid=1`,
          cancelUrl: `${base}/#/billing?pay=cancelled`,
        });
        billing = { required: true, checkoutUrl: session.url };
      } else {
        billing = { required: false };
      }
    }
```

a v respond:

```ts
    return reply.code(201).send({ status: "created", tenantId: tenant.id, ...(billing ? { billing } : {}) });
```

Importy v `auth.ts`:

```ts
import { adminBase } from "../stripe/gateway.js";
import { priceIdForTier } from "@ch/core";
```

Modify `packages/api/test/auth.test.ts` — přidej (import `defineFakeStripeGateway`, `testConfig`, `makeApp` už existují v helpers):

```ts
  it("adds billing block with checkout url when stripe is enabled", async () => {
    const { app } = makeApp({
      cfg: { ...testConfig, stripe: { ...testConfig.stripe, enabled: true, prices: { "12": "price_12" } } },
      stripe: defineFakeStripeGateway(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().billing).toMatchObject({ required: true, checkoutUrl: "https://checkout.stripe.com/test" });
    await (app as { close: () => Promise<void> }).close();
  });

  it("omits billing block when stripe is off", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().billing).toBeUndefined();
    await (app as { close: () => Promise<void> }).close();
  });
```

- [ ] **Step 4: Run full api tests + gates, verify pass**

Run:
```bash
npm run build --workspace @ch/core
npm run test --workspace @ch/api
npm run typecheck --workspace @ch/api
```
Expected: PASS — auth (vč. nových register billing testů), billing endpoints, webhook testy (tenantId z reálného `tenant.id` v closure).

Repozitní gaty zatím: `npm run typecheck` na rootu je očekávaně FAIL (worker captureRun cfg) — opraví Task 5. Pokud chceš čistý mezistav, přidej do `captureRun.test.ts` stripe/billing do cfg literálu (viz Task 5).

- [ ] **Step 5: Commit (sloučí Task 3 + Task 4)**

```bash
git add packages/api/src packages/api/test
git commit -m "feat(api): stripe gateway, billing routes, webhook sync, register checkout"
```

---

### Task 5: `@ch/worker` — billing jobs (usage + grace) + index wiring + tests

**Files:**
- Create: `packages/worker/src/stripe.ts`
- Create: `packages/worker/src/billing.ts`
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/worker/test/captureRun.test.ts` (cfg literal — dodá stripe/billing pole, jinak typecheck fail)
- Test: `packages/worker/test/billing.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 config + `BILLING_TIERS`; Task 2 repos metody.
- Produces:
  - `MeteringGateway` interface: `listSubscriptionItem(input: { subscriptionId: string }): Promise<{ id: string } | null>`, `reportUsage(input: { subscriptionItem: string; quantity: number; timestamp: number }): Promise<void>`
  - `createMeteringGateway(cfg): MeteringGateway | null`
  - `runBillingJobs(input: { repos: Repos; cfg: AppConfig; metering: MeteringGateway | null; now?: Date; log?: (m: string) => void }): Promise<void>`
  - `createFakeMeteringGateway()` (test helper v `billing.test.ts`)

- [ ] **Step 1: Write failing worker billing tests + extend cfg**

Create `packages/worker/test/billing.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { AppConfig, BillingPatch } from "@ch/core";
import { createFakeRepos } from "@ch/db";
import { runBillingJobs, type MeteringGateway } from "../src/billing.js";

const cfg: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
  stripe: { enabled: true, secretKey: "sk_test", webhookSecret: "whsec", prices: { "12": "price_12" } },
  billing: { graceDays: 3 },
};

function createFakeMetering(): MeteringGateway {
  return {
    listSubscriptionItem: vi.fn(async ({ subscriptionId }) => ({ id: `si_${subscriptionId}` })),
    reportUsage: vi.fn(async () => undefined),
  };
}

describe("grace check", () => {
  it("deactivates cameras and marks unpaid when grace expired", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.createCamera(tenant.id, {
      name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.setBillingState(tenant.id, {
      billingStatus: "past_due",
      billingGraceUntil: new Date("2026-09-10T00:00:00Z"),
      stripeSubscriptionId: "sub_1",
    });

    await runBillingJobs({
      repos,
      cfg,
      metering: createFakeMetering(),
      now: new Date("2026-09-18T00:00:00Z"),
    });

    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("unpaid");
    expect(repos.db.cameras[0]!.enabled).toBe(false);
  });

  it("keeps tenant past_due while grace is active", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.setBillingState(tenant.id, {
      billingStatus: "past_due",
      billingGraceUntil: new Date("2026-09-25T00:00:00Z"),
    });

    await runBillingJobs({
      repos,
      cfg,
      metering: createFakeMetering(),
      now: new Date("2026-09-18T00:00:00Z"),
    });

    expect((await repos.getTenantById(tenant.id))!.billingStatus).toBe("past_due");
  });

  it("skips grace check when no past_due tenants", async () => {
    const repos = createFakeRepos();
    await repos.createTenant({ name: "ACME", slug: "acme" });
    await runBillingJobs({
      repos,
      cfg,
      metering: createFakeMetering(),
      now: new Date("2026-09-18T00:00:00Z"),
    });
    expect(repos.db.tenants[0]!.billingStatus).toBe("none");
  });
});

describe("usage report", () => {
  it("reports camera count for active tenants", async () => {
    const repos = createFakeRepos();
    const metering = createFakeMetering();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.createCamera(tenant.id, {
      name: "A", feedType: "static_url", feedUrl: "https://a/x.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.createCamera(tenant.id, {
      name: "B", feedType: "static_url", feedUrl: "https://b/x.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.setBillingState(tenant.id, { billingStatus: "active", stripeSubscriptionId: "sub_9" });

    await runBillingJobs({
      repos,
      cfg,
      metering,
      now: new Date("2026-09-18T12:00:00Z"),
    });

    expect(metering.listSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sub_9" });
    expect(metering.reportUsage).toHaveBeenCalledWith({
      subscriptionItem: "si_sub_9",
      quantity: 2,
      timestamp: 1789732800,
    });
  });

  it("dampens reporting to once per hour per tenant", async () => {
    const repos = createFakeRepos();
    const metering = createFakeMetering();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.setBillingState(tenant.id, { billingStatus: "active", stripeSubscriptionId: "sub_9" });

    const run = (now: Date) =>
      runBillingJobs({ repos, cfg, metering, now });

    await run(new Date("2026-09-18T12:00:00Z"));
    await run(new Date("2026-09-18T12:30:00Z"));
    expect(metering.reportUsage).toHaveBeenCalledTimes(1);

    await run(new Date("2026-09-18T13:00:00Z"));
    expect(metering.reportUsage).toHaveBeenCalledTimes(2);
  });

  it("does not report when metering is disabled", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.setBillingState(tenant.id, { billingStatus: "active", stripeSubscriptionId: "sub_9" });
    await runBillingJobs({
      repos,
      cfg: { ...cfg, stripe: { ...cfg.stripe, enabled: false } },
      metering: null,
      now: new Date("2026-09-18T12:00:00Z"),
    });
    expect(repos.db.tenants[0]!.billingStatus).toBe("active");
  });
});
```

> Poznámka: `timestamp` v testu je unix sec pro `2026-09-18T12:00:00Z` = `1789732800` (ověřeno přes `Math.floor(new Date("2026-09-18T12:00:00Z").getTime() / 1000)`). Pokud pochybuješ, spusť lokálně `node -e "console.log(Math.floor(new Date('2026-09-18T12:00:00Z').getTime()/1000))"` — assert dej `timestamp: ts`.**Nepoužívej `1787131200` (to je 2026-08-19).**

Modify `packages/worker/test/captureRun.test.ts` cfg literal — přidej po řádku `plan: ...`:

```ts
  stripe: { enabled: false, secretKey: "", webhookSecret: "", prices: {} },
  billing: { graceDays: 3 },
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm run build --workspace @ch/core && npm run test --workspace @ch/worker -- billing`
Expected: FAIL — `../src/billing.js` neexistuje.

- [ ] **Step 3: Implement stripe.ts + billing.ts + index wiring**

Create `packages/worker/src/stripe.ts`:

```ts
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
      await stripe.usageRecords.create({
        subscription_item: subscriptionItem,
        quantity,
        timestamp,
      });
    },
  };
}
```

Create `packages/worker/src/billing.ts`:

```ts
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
```

Modify `packages/worker/src/index.ts`:

```ts
import { createMeteringGateway } from "./stripe.js";
import { runBillingJobs } from "./billing.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);
const metering = createMeteringGateway(cfg);

async function tick() {
  const processed = await runSchedule({ repos, storage, cfg, log: (m) => console.log(m) });
  if (processed > 0) console.log(`tick: captured/attempted ${processed}`);
  await runBillingJobs({ repos, cfg, metering, log: (m) => console.log(m) });
}
```

- [ ] **Step 4: Run worker tests + gates, verify pass**

Run:
```bash
npm run build --workspace @ch/core
npm run test --workspace @ch/worker
npm run typecheck --workspace @ch/worker
npm run typecheck
```
Expected: ALL PASS — včetně repo `npm run typecheck` (captureRun cfg opraven, helpers opraven v Task 3).

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src packages/worker/test
git commit -m "feat(worker): usage reporting and grace hard-stop billing jobs"
```

---

### Task 6: `@ch/admin` — Billing stránka + api.ts + hash view

**Files:**
- Modify: `packages/admin/src/api.ts` (typy + metody)
- Create: `packages/admin/src/Billing.tsx`
- Modify: `packages/admin/src/App.tsx` (hash view + nav)
- Modify: `packages/admin/src/App.css` (malé styly nav)
- Test: `packages/admin/src/test/Billing.test.tsx` (new)

**Interfaces:**
- Consumes: nic z repo (administrace volá API).
- Produces:
  - `BillingTierDto { months; label; eurPerCamera; current }`, `BillingDto { planMonths; price; billingStatus; stripeCustomerId; graceUntil; cameraCount; usageBytes; storageBytes; billingEnabled; tiers }`
  - api: `getBilling(): Promise<BillingDto>`, `billingCheckout(planMonths: number): Promise<{ url?: string; status?: string }>`, `billingPortal(): Promise<{ url: string }>`
  - `BillingPage` (export) — stránka + status badge + bannery.

- [ ] **Step 1: Write failing Billing page test**

Create `packages/admin/src/test/Billing.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPage } from "../Billing";

const billing = {
  planMonths: 12,
  price: 29,
  billingStatus: "past_due",
  stripeCustomerId: "cus_1",
  graceUntil: "2026-09-25T00:00:00.000Z",
  cameraCount: 3,
  usageBytes: 1234567,
  storageBytes: 14814804,
  billingEnabled: true,
  tiers: [
    { months: 0.5, label: "14 dní", eurPerCamera: 5, current: false },
    { months: 1, label: "1 měsíc", eurPerCamera: 9, current: false },
    { months: 3, label: "3 měsíce", eurPerCamera: 15, current: false },
    { months: 6, label: "6 měsíců", eurPerCamera: 22, current: false },
    { months: 12, label: "12 měsíců", eurPerCamera: 29, current: true },
    { months: 24, label: "24 měsíců", eurPerCamera: 49, current: false },
    { months: 36, label: "36 měsíců", eurPerCamera: 69, current: false },
  ],
};

vi.mock("../api", () => ({
  api: {
    getBilling: vi.fn(),
    billingCheckout: vi.fn(),
    billingPortal: vi.fn(),
  },
}));

import { api } from "../api";

beforeEach(() => {
  vi.clearAllMocks();
  (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue(billing);
  (api.billingCheckout as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://checkout.stripe.com/x" });
  (api.billingPortal as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://billing.stripe.com/x" });
});

describe("BillingPage", () => {
  it("renders plan, status and usage", async () => {
    render(<BillingPage />);
    const plan = await screen.findByTestId("current-plan");
    expect(plan).toHaveTextContent("12 měsíců");
    expect(plan).toHaveTextContent("29");
    expect(screen.getByText("po splatnosti")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
  });

  it("shows grace warning for past_due", async () => {
    render(<BillingPage />);
    expect(await screen.findByText(/aktivace do/i)).toBeInTheDocument();
  });

  it("redirects to checkout on plan change", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
    render(<BillingPage />);
    await screen.findByTestId("current-plan");
    await userEvent.click(screen.getByTestId("plan-24"));
    await userEvent.click(screen.getByTestId("change-plan"));
    await waitFor(() => expect(api.billingCheckout).toHaveBeenCalledWith(24));
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/x");
  });

  it("opens portal session", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
    render(<BillingPage />);
    await screen.findByTestId("current-plan");
    await userEvent.click(screen.getByTestId("open-portal"));
    await waitFor(() => expect(api.billingPortal).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/x");
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm run test --workspace @ch/admin`
Expected: FAIL — `../Billing` neexistuje.

- [ ] **Step 3: Implement api.ts + Billing.tsx + App wiring**

Modify `packages/admin/src/api.ts` — přidej typy a metody:

```ts
export type BillingStatus = "none" | "active" | "past_due" | "unpaid" | "canceled";

export interface BillingTierDto {
  months: number;
  label: string;
  eurPerCamera: number;
  current: boolean;
}

export interface BillingDto {
  planMonths: number;
  price: number | null;
  billingStatus: BillingStatus;
  stripeCustomerId: string | null;
  graceUntil: string | null;
  cameraCount: number;
  usageBytes: number;
  storageBytes: number;
  billingEnabled: boolean;
  tiers: BillingTierDto[];
}
```

v `export const api = {` přidej:

```ts
  getBilling: () => json<BillingDto>("/api/v1/admin/billing"),
  billingCheckout: (planMonths: number) =>
    json<{ url?: string; status?: string }>("/api/v1/admin/billing/checkout", { method: "POST", body: JSON.stringify({ planMonths }) }),
  billingPortal: () => json<{ url: string }>("/api/v1/admin/billing/portal", { method: "POST" }),
```

Create `packages/admin/src/Billing.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { api, type BillingDto, type BillingStatus } from "./api";

const STATUS_LABELS: Record<BillingStatus, string> = {
  none: "není aktivováno",
  active: "aktivní",
  past_due: "po splatnosti",
  unpaid: "není zaplaceno",
  canceled: "zrušeno",
};

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} kB`;
  return `${n} B`;
}

export function BillingPage() {
  const [data, setData] = useState<BillingDto | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getBilling().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams((window.location.hash.split("?")[1] ?? ""));
    if (params.get("paid") === "1") setNotice("Platba proběhla úspěšně.");
    if (params.get("pay") === "cancelled") setNotice("Platba byla zrušena.");
  }, [load]);

  const changePlan = async () => {
    if (selected === null) return;
    setError(null);
    try {
      const res = await api.billingCheckout(selected);
      if (res.url) window.location.assign(res.url);
      else {
        setNotice("Změní tarifu se projeví na příští faktuře.");
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const openPortal = async () => {
    setError(null);
    try {
      const res = await api.billingPortal();
      window.location.assign(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Načítám…</p>;

  return (
    <section className="panel" data-testid="billing-page">
      <div className="panel-head">
        <h2>Billing</h2>
        <span className={`status status-${data.billingStatus}`}>{STATUS_LABELS[data.billingStatus]}</span>
      </div>
      {!data.billingEnabled && (
        <p className="notice">Platební integrace není aktuálně zapnutá.</p>
      )}
      {notice && <p className="notice" data-testid="billing-notice">{notice}</p>}
      {data.billingStatus === "past_due" && data.graceUntil && (
        <p className="notice danger">
          Platba po splatnosti — aktivace do {new Date(data.graceUntil).toLocaleString()}.
        </p>
      )}
      {(data.billingStatus === "unpaid" || data.billingStatus === "canceled") && (
        <p className="notice danger">Účet není aktivní. Obnovte platbu pro zapnutí kamer.</p>
      )}
      <p data-testid="current-plan">
        Aktuální tarif: {data.tiers.find((t) => t.current)?.label ?? "—"} · {data.price ?? "—"} € / kamera
      </p>
      <div className="plan-grid">
        {data.tiers.map((tier) => (
          <label key={tier.months} className="plan-card">
            <input
              type="radio"
              name="plan"
              data-testid={`plan-${tier.months}`}
              checked={selected === tier.months}
              onChange={() => setSelected(tier.months)}
            />
            <strong>{tier.label}</strong>
            <span>{tier.eurPerCamera} € / kamera / měsíc</span>
            {tier.current && <em>aktuální</em>}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button onClick={changePlan} data-testid="change-plan">
          Změnit tarif
        </button>
        <button className="secondary" onClick={openPortal} data-testid="open-portal">
          Platby / faktury
        </button>
      </div>
      <dl className="usage-stats">
        <div><dt>Kamery</dt><dd data-testid="camera-count">{data.cameraCount}</dd></div>
        <div><dt>Uloženo</dt><dd data-testid="usage-bytes">{formatBytes(data.usageBytes)}</dd></div>
        <div><dt>Odhad plné retence</dt><dd data-testid="storage-bytes">{formatBytes(data.storageBytes)}</dd></div>
      </dl>
    </section>
  );
}
```

> Poznámka: testy assertují přes `data-testid="current-plan"` (text „Aktuální tarif …"), status badge je `STATUS_LABELS` (`past_due` → „po splatnosti"), grace banner obsahuje „aktivace do". Per-tier cena („29 € / kamera / měsíc") je v `plan-card`, ne v `current-plan`; `data.price` je zobrazeno v `current-plan` jako číslo.

Modify `packages/admin/src/App.tsx`:

- přidej import `BillingPage`.
- nad `App` přidej helper a v `App` stav + effect:

```tsx
function currentView(): "cameras" | "billing" {
  return window.location.hash.startsWith("#/billing") ? "billing" : "cameras";
}
```

v `App`:

```tsx
  const [view, setView] = useState<"cameras" | "billing">(currentView);

  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
```

V topbaru (přihlášený stav) přidej nav před `<span className="topbar-user">`:

```tsx
        <nav className="topbar-nav">
          <a href="#/cameras" data-testid="nav-cameras">Kamery</a>
          <a href="#/billing" data-testid="nav-billing">Billing</a>
        </nav>
```

a sekci obsahu — nahraď `<section className="panel">` blokem:

```tsx
      {view === "billing" ? (
        <BillingPage />
      ) : (
        <section className="panel"> … (stávající kamery) … </section>
      )}
```

zbytek App (modaly, confirming) zůstává.

Modify `packages/admin/src/App.css` — přidej:

```css
.topbar-nav { display: flex; gap: 12px; margin-left: 24px; }
.topbar-nav a { color: inherit; text-decoration: none; }
.topbar-nav a:hover { text-decoration: underline; }
.plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
.plan-card { display: flex; flex-direction: column; gap: 4px; border: 1px solid #ccc; padding: 12px; border-radius: 8px; cursor: pointer; }
.plan-card input { accent-color: #2f6f4f; }
.usage-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.usage-stats div { background: #f6f7f9; padding: 12px; border-radius: 8px; }
.usage-stats dt { color: #666; font-size: 0.85em; }
.notice { padding: 10px 12px; border-radius: 8px; background: #eef6ee; margin: 12px 0; }
.notice.danger { background: #fdecea; color: #a33; }
```

- [ ] **Step 4: Run admin tests + typecheck**

Run:
```bash
npm run test --workspace @ch/admin
npm run typecheck --workspace @ch/admin
```
Expected: PASS (nový Billing.test + stávající App.test — stávající nezměněné chování: bez hashe je view cameras).

- [ ] **Step 5: Commit**

```bash
git add packages/admin/src
git commit -m "feat(admin): billing page with plan selection and status banners"
```

---

### Task 7: Seed skript `scripts/seed-stripe.mjs` + README M4 + repo gaty + tidy check

**Files:**
- Create: `scripts/seed-stripe.mjs`
- Modify: `README.md` (sekce M4), `.env.example` (stripe/billing proměnné)

**Interfaces:**
- `node scripts/seed-stripe.mjs` — idempotentní: Product „Camera History", 7 metered Prices (lookup idempotence), BillingPortal configuration; tiskne env mapping `STRIPE_PRICE_<MONTHS>=<price_id>`.
- Stripe REST API přes `fetch` (Node 22), Bearer `STRIPE_SECRET_KEY`, bez npm deps.

- [ ] **Step 1: Implement seed script**

Create `scripts/seed-stripe.mjs`:

```js
#!/usr/bin/env node
// Idempotentní seed produktu, metered cen a Billing Portal konfigurace do Stripe.
// Bez deps: volá Stripe REST API přes global fetch (Node >= 20).
// Použití: STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs

const TIERS = [
  { months: 0.5, label: "14 dní", eur: 5 },
  { months: 1, label: "1 měsíc", eur: 9 },
  { months: 3, label: "3 měsíce", eur: 15 },
  { months: 6, label: "6 měsíců", eur: 22 },
  { months: 12, label: "12 měsíců", eur: 29 },
  { months: 24, label: "24 měsíců", eur: 49 },
  { months: 36, label: "36 měsíců", eur: 69 },
];

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}

const BASE = "https://api.stripe.com/v1";

async function api(path, params = {}, method = "GET") {
  const query = method === "GET" ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${BASE}${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey}` },
    body: method === "POST" ? new URLSearchParams(params) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function findProduct() {
  const { data } = await api("/products", { active: "true", limit: "100" });
  return data.find((p) => p.metadata.camera_history === "1") ?? null;
}

async function findPrice(lookupKey) {
  const { data } = await api("/prices", { "lookup_keys[]": lookupKey, active: "true", limit: "10" });
  return data.find((p) => p.lookup_key === lookupKey) ?? null;
}

async function findPortalConfig() {
  const { data } = await api("/billing_portal/configurations", { limit: "100" });
  return data.find((c) => c.metadata.camera_history === "1") ?? null;
}

const product = (await findProduct()) ?? (await api("/products", {
  name: "Camera History",
  "metadata[camera_history]": "1",
}, "POST"));

console.log(`product: ${product.id} (${product.name})`);

const priceIds = {};
for (const tier of TIERS) {
  const lookupKey = `ch_${String(tier.months).replace(".", "_")}m`;
  let price = await findPrice(lookupKey);
  if (!price) {
    price = await api("/prices", {
      product: product.id,
      currency: "eur",
      unit_amount: String(tier.eur * 100),
      billing_scheme: "per_unit",
      lookup_key: lookupKey,
      "metadata[camera_history]": "1",
      "recurring[interval]": "month",
      "recurring[usage_type]": "metered",
      "recurring[aggregate_usage]": "last_value",
    }, "POST");
  }
  const envKey = `STRIPE_PRICE_${String(tier.months).replace(".", "_")}`;
  priceIds[envKey] = price.id;
  console.log(`price ${lookupKey}: ${price.id}`);
}

const portal =
  (await findPortalConfig()) ??
  (await api("/billing_portal/configurations", {
    "business_profile[headline]": "Správa předplatného Camera History",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[payment_method_update][enabled]": "true",
    "features[invoice_history][enabled]": "true",
    "metadata[camera_history]": "1",
  }, "POST"));

console.log(`portal configuration: ${portal.id}`);

console.log("\nNastav do .env:");
for (const [k, v] of Object.entries(priceIds)) console.log(`${k}=${v}`);
console.log(`STRIPE_WEBHOOK_SECRET=whsec_... (z dashboardu, endpoint /api/v1/billing/webhook)`);
console.log("Stripe dashboard → Developers → Webhooks → add endpoint → events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted");
```

- [ ] **Step 2: Lint + syntax check**

Run:
```bash
node --check scripts/seed-stripe.mjs
npm run lint
```
Expected: `node --check` 0 chyb, eslint čistý (mjs ignorováno? ne — root eslint lintuje `.mjs`; pokud by selhalo na node globals, přistup fetch/URLSearchParams global — mělo by projít bezpecně; případně ignor přidat, ale preferuj čistý).

- [ ] **Step 3: `.env.example` + README M4**

Modify `.env.example` — přidej:

```
# Stripe billing (M4)
STRIPE_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_0_5=
STRIPE_PRICE_1=
STRIPE_PRICE_3=
STRIPE_PRICE_6=
STRIPE_PRICE_12=
STRIPE_PRICE_24=
STRIPE_PRICE_36=
BILLING_GRACE_DAYS=3
```

Modify `README.md` — append sekci M4:

```md
## M4 — Billing (Stripe metered)

Platí se €/kamera/měsíc podle retenčního tieru (14 dní–36 měsíců). Stripe vypnutý (výchozí) = aplikace běží bez plateb,
Billing stránka ukáže banner. Zapnutí: `STRIPE_ENABLED=true` + `STRIPE_SECRET_KEY` + price ids.

### Simulační (Stripe test mode) spuštění

1. `STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs` — vytvoří produkt, 7 metered cen a Billing Portal config.
2. Do `.env` zkopíruj vypsané `STRIPE_PRICE_*`, nastav `STRIPE_WEBHOOK_SECRET` z dashboardu.
3. Stripe → Developers → Webhooks → přidej endpoint `https://camera.sengycraft.cz/api/v1/billing/webhook` s událostmi
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Billing Portal: ověř v dashboardu, že subscription_cancel je povoleno (seed to nastaví).

### Hard stop

`past_due` + 3 dny grace (`BILLING_GRACE_DAYS`) → worker deaktivuje kamery na `enabled=false`, tenant přejde do `unpaid`.
Reaktivace automaticky po zaplacení (webhook `active`) — kamery se znovu zapnou.

### Worker

`npm run dev:worker` — kromě snímků reportuje metered usage (počet kamer, dameno 1×/h) a hlídá hard stop.
```

- [ ] **Step 4: Full repo gates**

Run:
```bash
npm install
npm run typecheck
npm run test
npm run lint
npm run build
```
Expected: ALL PASS. (`npm install` stáhne `stripe` do api+worker.)

Control: `npm ls --workspaces --depth=0` — identické (6 balíčků, žádný nový).

- [ ] **Step 5: Tidy check**

Run:
```bash
git status
node --check scripts/seed-stripe.mjs
php -l packages/wp-plugin/camera-history/*.php packages/wp-plugin/camera-history/includes/*.php  # beze změn, sanitárně
```
Expected: `git status` jen M4 artefakty (7 task commitů), žádné nezamýšlené soubory.

- [ ] **Step 6: Commit seed + docs**

```bash
git add scripts/seed-stripe.mjs .env.example README.md
git commit -m "docs: M4 billing seed script, env, README; premium gates green"
```

---

## Definition of Done (spec §9 + M4 summary)

- [ ] `@ch/core`: config stripe/billing, ceník (BILLING_TIERS + lookup), `retentionCutoff` 0.5, `Tenant` billing pole; unit testy PASS.
- [ ] `@ch/db`: migrace 0002 (plan_months numeric(4,1), billing_status enum, stripe/grace sloupce) vygenerovaná + commitnutá; repo funkce (countCameras, usageStats, setTenantCamerasEnabled, setBillingState, listTenantsByBillingStatus) v repos + fakeRepos; testy PASS.
- [ ] `@ch/api`: StripeGateway (DI, api+server wiring), register → customer+checkout (když enabled), billing GET/checkout/portal, webhook signature + sync (checkout.completed, subscription.updated: active/past_due/unpaid/canceled, deleted, reactivace kamer, plan_months z price); integration testy s fake gateway PASS.
- [ ] `@ch/worker`: metered usage report (damení 1 h, quantity=cameraCount) + grace hard stop (past_due+grace expired → deaktivace + unpaid); testy PASS; index.ts wiring.
- [ ] `@ch/admin`: hash view `#/billing`, BillingPage (status badge, plan cards, usage stats, checkout/portal, bannery past_due/unpaid/canceled, stripe off banner); RTL test PASS.
- [ ] Stripe disabled → plný provoz (register bez billing bloku, billing endpointy 409, worker UsageReport no-op).
- [ ] Seed skript (REST, idempotentní) + README M4 + `.env.example`.
- [ ] Repo gaty: `npm run typecheck && npm run test && npm run lint && npm run build` PASS; workspace identické.