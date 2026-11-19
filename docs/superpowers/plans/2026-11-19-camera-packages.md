# Camera Packages + 1-Year Retention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-camera retention billing with five monthly packages by camera count, all including 12 months of history, and update the finance plan, Stripe, API, admin, landing, and tests to match.

**Architecture:** A canonical package catalog lives in `@ch/core`. Each tenant stores one `package_code`; its camera limit is derived from the catalog. Stripe holds one subscription per tenant with one package price (quantity 1). Camera creation is hard-capped by the package. Retention is a single 12-month constant; a worker job deletes older images from Postgres and MinIO. The finance PDF is recalculated first, from the same package prices.

**Tech Stack:** TypeScript, Fastify, Drizzle/Postgres, React + Vite, Stripe, MinIO, Vitest, Chromium headless for the PDF.

**Status:** Task 1 (finance PDF) is done. Tasks 2–8 are awaiting review and must not be implemented until the user approves this plan.

## Global Constraints

- Prices are **monthly, EUR, tax-inclusive**: Solo €7.99 / 1 camera, Starter €13.99 / 3, Plus €19.99 / 5, Pro €29.99 / 10, Network €49.99 / 25.
- Every package includes **12 months of history**. No retention tiers, no per-camera plan overrides.
- Camera limits are hard caps. Adding camera #limit+1 returns `409 camera_limit_reached`.
- Downgrades are blocked while `cameraCount > newPackage.maxCameras`; the customer must delete cameras first.
- The 30-day free trial is removed. Pilots remain free; pilots do not pass through checkout.
- Finance model: 50 paying customers by Dec 2027, 150 cameras (3 per customer), average package Starter €13.99, fixed conversion **25 Kč/€**.
- Do not add new fonts or hardcoded colours; use `@ch/design` tokens.
- Do not commit or push until the user explicitly asks. Working tree already contains unrelated WIP (`docs/risk-analysis.*`, `scripts/risk-editor/`) — leave it untouched.
- Verification gates after code changes: `npm run typecheck && npm test && npm run lint && npm run build && npm run design:check`.

---

## Migration at a Glance

This is a pre-launch reset, not a live-customer migration:

- Current DB: 13 tenants, max 3 cameras each, 0 active Stripe subscriptions. One camera has a 1-month override; Alpine Summit has 3 cameras.
- Stripe live is not enabled. Sandbox subscriptions can be canceled/reset.
- Phase 1: finance PDF (Task 1).
- Phase 2: core catalog + DB migration (Tasks 2–3).
- Phase 3: API, Stripe checkout/change, camera limits (Task 4).
- Phase 4: worker retention purge + storage cleanup (Task 5).
- Phase 5: admin UI (Task 6).
- Phase 6: landing pricing/FAQ/SEO (Task 7).
- Phase 7: Stripe seed, docs, cutover, smoke tests (Task 8).

Backups before cutover:

```bash
mkdir -p /home/ubuntu/backups
pg_dump "$DATABASE_URL" | gzip > /home/ubuntu/backups/camera-history-$(date +%Y-%m-%d-%H%M).sql.gz
cp .env /home/ubuntu/backups/camera-history-$(date +%Y-%m-%d-%H%M).env
```

No commit/push until the user asks. The unrelated WIP (`docs/risk-analysis.*`, `scripts/risk-editor/`) must stay untouched.

---

## Trello Audit (2026-11-19)

The board still described the old per-camera retention model in several places. These edits were applied on 19. 11. 2026; the board is the source of truth:

| Card | List | Inconsistency | Action |
|---|---|---|---|
| **Rozsah a trh** | Hotovo | Says the self-service still gets “first month free (first 20 subscriptions)” and pilots do not consume free-month slots. Trial is canceled. | Remove the free-month sentence; add “trial zrušen 19. 11. 2026; piloti 3 měsíce zdarma, samoobsluha platí od začátku.” |
| **Produkt a admin — základ** | Hotovo | Checklist item “Retention plány” is done, but retention is now fixed at 12 months and the paid unit is a package. | Reopen or add a comment that this item is superseded by packages + 12 months; do not claim retention tiers are done. |
| **Stripe — sandbox** | Hotovo | Checklist says “7 cen” and “Synchronizace položek”, i.e. seven retention prices and hourly quantity sync. | Reopen/rename to “Stripe — balíčky”; replace with 5 package prices, one subscription item quantity 1, no quantity sync. Keep grace, gating and portal. |
| **Admin — Billing — většina designu** | 25. 11. | “Výběr plánu” and “Rozpad ceny” still assume retention tiers and per-camera pricing. | Change to package cards, cameras `X / Y`, camera limit, upgrade and blocked downgrade, “12 months included”. Keep invoices, payment error, grace, cancel/resume. |
| **Admin — Billing — edge cases** | 13. 1. | “Otestovat free month” and “Otestovat souběh free-month slotů” are obsolete. | Remove free-month tests. Add: 4th camera on Starter, downgrade over limit, package change/proration, delete camera and free slot, 0 cameras. “Spočítat náklady” is done in the finance PDF. |
| **Pilotní onboarding** | 27. 1. | “Nastavit retention” is no longer a choice; “Nastavit billing” conflicts with pilots being free. | Replace with “Přiřadit balíček (Starter/Network podle počtu kamer)”, “Ověřit 12 měsíců retence”, “Připravit přechod na placený balíček po pilotu”. |
| **Landing — většina designu** | 25. 11. | “Vylepšit ceny a FAQ” still refers to the old 7-tier pricing. | Specify five packages, 12 months everywhere, no retention tiers, FAQ on upgrades/downgrades. |
| **Stripe účet** | 13. 1. | “Zkontrolovat ceny” is generic. | Specify five package prices, EUR, monthly, tax-inclusive. |
| **Stripe live (checkout a portál)** | 20. 1. | “Vytvořit live ceny” is generic and may imply per-camera quantities. | Specify five package prices, one line item quantity 1, no quantity sync; portal for invoices/cancel. |
| **Admin — Billing — finální design** | 9. 12. | “Všechny stavy” is generic. | Add package limit, downgrade block, upgrade/proration and payment-error states. |
| **Missing migration card** | — | No card covers the package migration or the finance PDF. Design Billingu is due 25. 11., before the backend/Stripe change. | Add `Balíčky a 1letá retence` with the Task 2–8 checklist; schedule the backend before the Billing design or explicitly design against this spec. |
| **Landing + deck** | — | Both still show 7 tiers and 14 days–36 months. Landing was reverted; the deck is stale. | Update both in Task 7; regenerate `packages/site/public/deck.pdf`. |
| **Právo na webu / GDPR** | 25. 11. / 6. 1. | Legal copy may still promise 14 days–36 months or plan-based retention. | When writing terms/privacy/DPA/AUP, state 12 months on every package and package-based camera limits. |

**Downstream cards to align (not direct contradictions):**

| Card | Change |
|---|---|
| **API — validace kamer** | Add package camera limit, 409 `camera_limit_reached`, and count disabled cameras. |
| **Mazání dat** | Specify 12-month purge and camera-deletion storage cleanup/orphan logging. |
| **In-app onboarding zákazníka** | Include package selection and the `X / Y` camera limit. |
| **Admin — Billing — live test** | Test 5 package prices, one subscription item, upgrade/downgrade, limit and portal. |
| **Launch checklist** | Add 5 Stripe env prices, 12-month purge, no trial, camera-limit smoke test. |
| **Piloti a akceptace** | Assign a package, verify 12 months, no checkout/billing for pilots. |
| **Monitoring a podpora** | Alert on purge failures, webhook failures and repeated `camera_limit_reached`. |
| **Sales materiály a deck** | Use five packages and 12 months; remove 14 days–36 months. |
| **QA — mobil, přístupnost a výkon** | Cover package cards, usage bar, limit error and downgrade states. |
| **Formuláře — validace a chybové stavy** | Add the `camera_limit_reached` message and upgrade link. |

No Trello changes were made during this audit. The board is the source of truth; update these cards when the plan is approved.

---

## File Map

| Area | Files |
|---|---|
| Finance PDF | `scripts/build-finance.mjs` (new), `docs/finance-plan.html`, `docs/finance-plan.pdf` |
| Core | `packages/core/src/billing.ts`, `packages/core/src/config.ts`, `packages/core/src/types.ts`, `packages/core/src/index.ts` |
| DB | `packages/db/src/schema.ts`, `packages/db/drizzle/0011_*.sql`, `packages/db/src/repos.ts`, `packages/db/src/repos.types.ts`, `packages/db/src/testing/fakeRepos.ts` |
| API | `packages/api/src/routes/billing.ts`, `packages/api/src/routes/admin.ts`, `packages/api/src/routes/auth.ts`, `packages/api/src/routes/public.ts`, `packages/api/src/stripe/gateway.ts` |
| Worker | `packages/worker/src/billing.ts`, `packages/worker/src/stripe.ts`, `packages/worker/src/retention.ts` (new), `packages/worker/src/index.ts` |
| Storage | `packages/db/src/storage.ts` (`remove`) |
| Admin | `packages/admin/src/Billing.tsx`, `packages/admin/src/App.tsx`, `packages/admin/src/api.ts`, `packages/admin/src/App.css` |
| Landing | `packages/site/index.html`, `packages/site/src/site.css`, `packages/site/test/landing.test.ts`, `packages/site/test/seo.test.ts` |
| Stripe/docs | `scripts/seed-stripe.mjs`, `README.md` |
| Deck | `packages/site/deck/index.html`, `packages/site/public/deck.pdf`, `packages/site/scripts/export-deck-pdf.mjs` |

---

## Change Inventory (review this list)

| Area | What changes |
|---|---|
| Finance PDF | Prices, 3 cameras/customer, 50 customers/150 cameras, new P&L, chart, payback. **Done.** |
| Core | `PACKAGE_TIERS`, `PackageCode`, `RETENTION_MONTHS`, `DEFAULT_PACKAGE`, limit/price lookup; config env keys; Tenant/Camera types. |
| DB | `package_code` + backfill, drop `plan_months` / `trial_claimed_at`, add `images_timestamp_idx`, check constraint, repo methods, fake repos. |
| API | Billing DTO, checkout with one package item, package change/upgrade/downgrade, webhook package mapping, camera limit, 12-month public retention, auth default package. |
| Worker | Remove hourly quantity sync; add daily 12-month purge; keep grace/zero-camera auto-cancel; storage remove. |
| Storage | `remove(key)`; camera deletion deletes DB rows first, then objects; failed removals are logged as orphans. |
| Admin | Billing package cards, camera usage/limit, downgrade block, payment/grace states, portal for invoices/cancel; remove per-camera retention editor; delete-camera warning; disable “New camera” at limit. |
| Landing | Five packages, 12 months everywhere, FAQ, SEO offer values, remove per-camera/retention copy. |
| Deck | Five packages, 12 months, regenerate `deck.pdf`; remove 14 days–36 months. |
| Legal/GDPR | Terms/privacy/DPA/AUP must state 12 months and package limits; coordinate with `Právo na webu` and `GDPR dokumenty` cards. |
| Stripe | Seed 5 package prices, archive 7 old prices, new env keys, one-item subscription, portal unchanged (subscription update stays disabled), webhook metadata `packageCode`. |
| Tests | Core catalog/config, DB/repos, API billing/limits, worker purge, admin Billing/limits, landing/SEO, deck tests. |
| Docs | README M4, pilot instructions (no `trial_claimed_at`), env table, cutover/rollback. |
| Trello | Update the cards in the audit above; add the missing migration card. |
| Ops | DB backup, migration, sandbox reset, smoke tests, purge dry-run, monitoring for purge/webhook/limit errors. |

---

## Sequencing and Approval Gate

1. The user reviews and approves this plan.
2. Tasks 2–4 (core, DB, API, Stripe contract) land before Task 6 (Admin Billing UI). Do not design Billing against the current per-camera code.
3. Task 5 (purge/storage) lands before launch; Task 7 (landing + deck) can follow the API contract; Task 8 is the cutover.
4. If the 25. 11. Billing design deadline stays, either finish the Task 2–4 contract first or design explicitly against this spec and mark the Trello card as “design against packages spec”.
5. No implementation starts until this plan is approved. Task 1 is already done.

---

## Review Addenda (2026-11-19)

The first pass missed these; they are now part of the tasks:

- Trello audit table + downstream cards, including the missing migration card and the 25. 11. sequencing conflict.
- Deck update and `deck.pdf` regeneration (Task 7).
- Legal/GDPR copy must say 12 months and package limits (Task 8).
- Camera deletion order: DB first, then objects; orphan logging (Task 5).
- Camera limit enforced by a locking repo method, not a count-then-insert race (Tasks 3–4).
- Public group retention fixed at 12 months, not just single-camera retention (Task 3).
- Stripe `changePackage` replaces all items and updates `metadata.packageCode` (Task 4).
- Rollback image tagging uses Compose’s actual image names (Task 8).
- Purge/webhook/limit monitoring and post-cutover checks (Tasks 5, 8).
- 0-camera tenants backfill to Starter, not Solo, to match the new default (Task 3).

---

### Task 1: Finance plan PDF (do this first)

**Files:**
- Create: `scripts/build-finance.mjs`
- Modify: `docs/finance-plan.html`
- Regenerate: `docs/finance-plan.pdf`

**Model constants (Kč unless noted):**

```js
const RATE = 250;                 // own time Kč/h
const DEV_HOURS = 100;
const DOMAIN = 300;
const INITIAL = DEV_HOURS * RATE + DOMAIN; // 25 300
const EUR_CZK = 25;
const FIXED = 550;                // hosting 300 + AI 250
const TIME = 15 * RATE;           // 3 750
const CAMERAS_PER_CUSTOMER = 3;
const AVG_PACKAGE_EUR = 13.99;    // Starter
const STRIPE_RATE = 0.045;
const STORAGE_PER_CAMERA = 0.5;   // Kč/month
```

**Customer ramp 2027:** Jan 0, Feb 0, Mar 3, Apr 5, May 8, Jun 10, Jul 15, Aug 20, Sep 25, Oct 33, Nov 40, Dec 50.

**Derived numbers that must appear in the PDF:**

- Revenue per customer: 349.75 Kč (€13.99 × 25).
- Variable per customer: 17.24 Kč (Stripe 15.74 + storage 1.50).
- Contribution per customer: 332.51 Kč.
- Monthly break-even including own time: **13 customers**.
- MRR at 50 customers: **17 488 Kč**.
- Monthly profit after own time: **12 326 Kč**.
- Cumulative trough: about **−42 455 Kč** in June 2027.
- Cumulative payback: **January 2028**.
- Cash payback (without own time): **October 2027**.

**PDF structure (A–E, max 2 pages):**

- Header: `Finanční rozvaha - Camera History`.
- Summary: initial 25 300 Kč; monthly costs 4 300 Kč; payback January 2028.
- **A** — 100 h × 250 Kč + domain 300 = 25 300 Kč.
- **B** — variable per customer 17.24 Kč (Stripe 4.5 %, storage 3 cameras); fixed 550 Kč + own time 3 750 Kč = 4 300 Kč.
- **C** — package table (Solo/Starter/Plus/Pro/Network, cameras, €/month, Kč/month), the 3-camera assumption, and the monthly ramp table (customers, cameras, revenue). Year 1 total: 50 customers, 150 cameras, 17 488 Kč/month at Dec.
- **D** — `Leden 2028`; 13 customers cover monthly costs; 12 326 Kč monthly profit at 50 customers; cumulative chart; cash payback October 2027.
- **E** — monthly P&L at 50 customers: 17 488 − 862 − 550 − 3 750 = **12 326 Kč**.
- The PDF intentionally carries no explanatory notes; the 25 Kč/€ conversion is an internal model assumption, not printed copy.

- [x] **Step 1: Write `scripts/build-finance.mjs`** with the constants above and the existing PDF styling. Generate `docs/finance-plan.html`.
- [x] **Step 2: Render the PDF**

```bash
/usr/local/bin/chromium --headless --disable-gpu --no-sandbox \
  --allow-file-access-from-files --no-pdf-header-footer \
  --print-to-pdf=docs/finance-plan.pdf \
  file:///home/ubuntu/camera-history/docs/finance-plan.html
pdfinfo docs/finance-plan.pdf | grep Pages
```

Expected: `Pages: 2` (1–2 acceptable, never 3).

- [x] **Step 3: Visual check** at 110 dpi. Verify the package table, the monthly table, the chart crossing zero in January 2028, and the P&L numbers. Fix spacing/overflow only.

**Status:** done — `docs/finance-plan.pdf`, 2 pages, 50 customers / 150 cameras, payback January 2028.

---

### Task 2: Core package catalog, config, types

**Files:**
- Modify: `packages/core/src/billing.ts`
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/test/billing.test.ts`, `packages/core/test/config.test.ts`

**Interfaces (produced for all later tasks):**

```ts
export const RETENTION_MONTHS = 12;

export type PackageCode = "solo" | "starter" | "plus" | "pro" | "network";

export interface PackageTier {
  code: PackageCode;
  name: string;
  maxCameras: number;
  eurPerMonth: number;
  priceEnv: string; // STRIPE_PRICE_*
}

export const PACKAGE_TIERS: PackageTier[];
export const DEFAULT_PACKAGE: PackageCode; // "starter"

export function isPackageCode(value: string): value is PackageCode;
export function packageForCode(code: string): PackageTier | null;
export function cameraLimitForPackage(code: string): number;
export function priceIdForPackage(prices: Record<string, string>, code: string): string | null;
export function packageForPriceId(prices: Record<string, string>, priceId: string): PackageCode | null;
export function packageForCameraCount(count: number): PackageTier;
```

Catalog values:

```ts
{ code: "solo",    name: "Solo",    maxCameras: 1,  eurPerMonth: 7.99,  priceEnv: "STRIPE_PRICE_SOLO" }
{ code: "starter", name: "Starter", maxCameras: 3,  eurPerMonth: 13.99, priceEnv: "STRIPE_PRICE_STARTER" }
{ code: "plus",    name: "Plus",    maxCameras: 5,  eurPerMonth: 19.99, priceEnv: "STRIPE_PRICE_PLUS" }
{ code: "pro",     name: "Pro",     maxCameras: 10, eurPerMonth: 29.99, priceEnv: "STRIPE_PRICE_PRO" }
{ code: "network", name: "Network", maxCameras: 25, eurPerMonth: 49.99, priceEnv: "STRIPE_PRICE_NETWORK" }
```

- [x] **Step 1: Replace `packages/core/test/billing.test.ts`** with tests for: 5 codes, limits, prices, default package, `packageForPriceId`, and `packageForCameraCount` (0→Starter, 1→Solo, 3→Starter, 6→Pro, 25→Network).
- [x] **Step 2: Run** `npx vitest run packages/core/test/billing.test.ts` — expect FAIL.
- [x] **Step 3: Implement `billing.ts`** and update `index.ts` exports.
- [x] **Step 4: Config** — replace `PRICE_ENV_KEYS` with the five package env keys; `pricesFromEnv` returns `{ solo, starter, plus, pro, network }`; remove `plan.defaultRetentionMonths` / `plan.maxRetentionMonths` and the `plan` config object.
- [x] **Step 5: Types** — `Tenant.packageCode`, remove `Tenant.planMonths` and `trialClaimedAt`; `BillingPatch.packageCode`; `NewTenant.packageCode?`; remove `planMonths` from `Camera`, `NewCamera`, `CameraPatch`.
- [x] **Step 6: Run** `npx vitest run packages/core/test` and `npm run typecheck --workspace @ch/core`.

**Status:** done — 37 core tests pass; `@ch/core` typecheck passes. The rest of the monorepo is expected to be red until Tasks 3–4 remove `planMonths` / trial references.

---

### Task 3: DB schema, migration, repos

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0011_package_code.sql`
- Modify: `packages/db/src/repos.ts`, `packages/db/src/repos.types.ts`, `packages/db/src/testing/fakeRepos.ts`

**Schema changes:**
- `tenants.packageCode`: `text("package_code").notNull().default("starter")`.
- Drop `tenants.planMonths`, `tenants.trialClaimedAt`.
- Drop `cameras.planMonths`.
- Add `index("images_timestamp_idx").on(images.timestamp)`.
- Remove `cameraPlanCounts`, `countTrialClaims` from `Repos`.

**Migration SQL:**

```sql
ALTER TABLE "tenants" ADD COLUMN "package_code" text NOT NULL DEFAULT 'starter';

UPDATE "tenants" SET "package_code" = CASE
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") = 1 THEN 'solo'
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") <= 3 THEN 'starter'
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") <= 5 THEN 'plus'
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") <= 10 THEN 'pro'
  ELSE 'network'
END;

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_package_code_check"
  CHECK ("package_code" IN ('solo', 'starter', 'plus', 'pro', 'network'));

ALTER TABLE "tenants" DROP COLUMN "plan_months";
ALTER TABLE "tenants" DROP COLUMN "trial_claimed_at";
ALTER TABLE "cameras" DROP COLUMN "plan_months";
CREATE INDEX "images_timestamp_idx" ON "images" ("timestamp");
```

Pilot tenants keep `is_pilot` and get a package without checkout. Assign the smallest package that fits their cameras, or Network (25) when they need flexibility. 0-camera tenants backfill to Starter; new tenants also default to Starter.

**New repo interface:**

```ts
createCameraWithLimit(
  tenantId: string,
  input: NewCamera,
  limit: number,
): Promise<{ camera: Camera } | { camera: null; cameraCount: number }>;
```

It locks the tenant row, counts **all** cameras (including disabled), inserts only when below `limit`, and returns the count when the cap is hit.

- [x] **Step 1: Update schema and generate the migration** with `npm run db:generate --workspace @ch/db`; verify the generated SQL matches the above (hand-edit if drizzle emits a different order).
- [x] **Step 2: Update repos** — `toTenant` maps `packageCode`; `createTenant` defaults `DEFAULT_PACKAGE`; `setBillingState` accepts `packageCode`; `getPublicCamera` **and `getGroupBySlug`** return `retentionMonths: RETENTION_MONTHS` and stop selecting plan columns; remove `cameraPlanCounts` and `countTrialClaims`. Add `createCameraWithLimit(tenantId, input, limit)` that locks the tenant row, counts all cameras and inserts in one transaction; return `{ camera }` or `{ camera: null, cameraCount }`.
- [x] **Step 3: Update `fakeRepos`** with the same shapes; package-based tenant creation; implement `createCameraWithLimit` so tests can exercise the cap.
- [x] **Step 4: Run** `npx vitest run packages/db` and `npm run typecheck --workspace @ch/db`.

**Status:** done — `packages/db/drizzle/0011_dear_ma_gnuci.sql` generated and hand-checked; 15 DB tests pass, `@ch/db` typecheck/build pass. Migration is **not applied** to the production DB yet.

---

### Task 4: API billing, Stripe gateway, camera limits

**Files:**
- Modify: `packages/api/src/routes/billing.ts`
- Modify: `packages/api/src/stripe/gateway.ts`
- Modify: `packages/api/src/routes/admin.ts`
- Modify: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/routes/public.ts`
- Modify: `packages/api/test/billing.test.ts`, `packages/api/test/admin.test.ts`, `packages/api/test/helpers.ts`

**Billing DTO (GET `/api/v1/admin/billing`):**

```ts
{
  packageCode: PackageCode;
  packageName: string;
  cameraLimit: number;
  cameraCount: number;
  price: number;          // eur/month
  monthlyTotal: number;   // eur/month (same as price, not camera count)
  billingStatus: BillingStatus;
  hasSubscription: boolean;
  stripeCustomerId: string | null;
  graceUntil: string | null;
  isPilot: boolean;
  pilotUntil: string | null;
  billingEnabled: boolean;
  pricesConfigured: boolean;
  packages: Array<{
    code: PackageCode;
    name: string;
    maxCameras: number;
    eurPerMonth: number;
    current: boolean;
    available: boolean; // false when cameraCount > maxCameras
  }>;
}
```

**Endpoints:**
- `POST /api/v1/admin/billing/package { packageCode }` — set/change package. If no subscription: validate limit, set `packageCode`. If subscription: validate limit, call `stripe.changePackage({ subscriptionId, priceId, packageCode })`, then set `packageCode`. On downgrade over limit: `409 camera_limit_exceeded` with `{ packageCode, cameraCount, limit }`.
- `POST /api/v1/admin/billing/checkout { packageCode? }` — validate/limit/set package, reject pilots, require cameras and all five prices, single price item quantity 1, no trial. Metadata `packageCode`.
- `POST /api/v1/admin/billing/portal` — unchanged (invoices, payment method, cancel/resume).
- Webhook `checkout.session.completed` — set `packageCode` from metadata.
- Webhook `customer.subscription.updated` — derive package from `items.data[0].price.id` when present; fallback to metadata; handle status/grace.
- Remove `checkout.session.expired` trial-reset logic.

**Trial removal checklist:** delete `FREE_TRIAL_SLOTS`, `FREE_TRIAL_DAYS`, `trialClaimedAt`, `countTrialClaims`, `freeMonth*` DTO fields, the free-month notices/tests, checkout `trial_period_days` / `trial_settings`, the `checkout.session.expired` handler, and README instructions that mention `trial_claimed_at`. Pilots remain free via `is_pilot`; no self-service trial.

**Gateway changes:**
- `createCheckoutSession(input: { customer, priceId, tenantId, packageCode, successUrl, cancelUrl })` — one line item, no trial, metadata `packageCode`.
- Add `changePackage(input: { subscriptionId, priceId, packageCode }): Promise<void>` — retrieve the subscription with its items. If there is no item, throw. Replace **all** existing items with one new price item quantity 1 (delete extras) using `proration_behavior: "create_prorations"`, and update `metadata.packageCode`. This also cleans up legacy multi-item subscriptions.
- Remove `planMonths`, `trialPeriodDays`, `items` array from the public interface.
- Keep the Stripe portal `subscription_update` disabled; package changes happen in-app. Portal remains the invoice, payment-method, cancel-at-period-end and resume surface.

**Camera limit:**
Count **all** cameras, including disabled ones. Use `repos.createCameraWithLimit(tenantId, input, limit)` from Task 3 to lock the tenant row, count and insert in one transaction. In `POST /api/v1/admin/cameras`:
```ts
const tenant = await deps.repos.getTenantById(req.user!.tenantId);
const limit = cameraLimitForPackage(tenant!.packageCode);
const result = await deps.repos.createCameraWithLimit(req.user!.tenantId, input, limit);
if (!result.camera) {
  throw new HttpError(409, "camera_limit_reached",
    `Package ${tenant!.packageCode} allows ${limit} cameras. Upgrade to add more.`);
}
return result.camera;
```
Return `{ packageCode, cameraCount, limit }` in the error body if `HttpError` supports details; otherwise include the values in the message. Remove `planMonths` parsing from camera create/update and tenant patch.

**Auth/public:**
- Registration creates a tenant with `packageCode: DEFAULT_PACKAGE`.
- `public.ts` uses `retentionCutoff(RETENTION_MONTHS)`; no camera/tenant plan joins.

- [x] **Step 1: Rewrite `packages/api/test/billing.test.ts`** for the new DTO, package change, checkout single item, camera limit (including disabled cameras), downgrade block, pilot checkout rejection, and absence of free-month fields. Run it — expect FAIL.
- [x] **Step 2: Implement the gateway and routes**; update `helpers.ts` fake gateway with `changePackage` including `packageCode`.
- [x] **Step 3: Update admin/auth/public routes**; remove all `planMonths` references (grep must be clean outside legacy docs).
- [x] **Step 4: Run** `npx vitest run packages/api` and `npm run typecheck --workspace @ch/api`.

**Status:** done — 101 API tests pass (7 DB integration tests skipped), `@ch/api` typecheck/build pass. Admin and worker still reference the old model until Tasks 5–6.

---

### Task 5: Worker purge, storage removal, billing simplification

**Files:**
- Modify: `packages/db/src/storage.ts` — add `remove(key: string): Promise<void>` using MinIO `removeObject`.
- Modify: `packages/db/src/repos.ts` / `repos.types.ts` — add `listImagesBefore(cutoff, limit)`, `deleteImages(ids)` and `listImagesForCamera(cameraId)`.
- Create: `packages/worker/src/retention.ts`, `packages/worker/test/retention.test.ts`
- Modify: `packages/worker/src/billing.ts`, `packages/worker/src/stripe.ts`, `packages/worker/src/index.ts`, `packages/worker/test/billing.test.ts`

**Retention job:**

```ts
export interface RetentionPurgeInput {
  repos: Pick<Repos, "listImagesBefore" | "deleteImages">;
  storage: Pick<ObjectStorage, "remove">;
  now?: Date;
  batchSize?: number;
  log?: (message: string) => void;
}

export async function purgeExpiredImages(input: RetentionPurgeInput): Promise<number> {
  const cutoff = retentionCutoff(RETENTION_MONTHS, input.now ?? new Date());
  const batchSize = input.batchSize ?? 500;
  let removed = 0;
  for (;;) {
    const rows = await input.repos.listImagesBefore(cutoff, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      try {
        await input.repos.deleteImages([row.id]);
        removed += 1;
      } catch (error) {
        input.log?.(`retention: failed row ${row.id}: ${String(error)}`);
        continue;
      }
      try {
        await input.storage.remove(row.storageKey);
      } catch (error) {
        input.log?.(`retention: orphan object ${row.storageKey}: ${String(error)}`);
      }
    }
    if (rows.length < batchSize) break;
  }
  return removed;
}
```

Delete the DB row first, then the object. A failed object removal leaves an orphan object, never a DB row pointing to a missing file. Log orphan keys for a manual/orphan sweep.

Run it from `tick()` at most once per 24 h with an in-memory `lastPurge` timestamp. Log `retention: removed N, failed M` and each failure; expose the counts in worker logs for the cutover check.

**Billing simplification:** remove `syncSubscription` and the hourly quantity loop. Keep past-due grace and the zero-camera auto-cancel/resume check; it now only calls `scheduleAutoCancel`/`resumeAutoCancel`, never `syncSubscription`. Remove `BILLING_TIERS`, `priceIdForTier`, `cameraPlanCounts` imports.

**Camera deletion cleanup:** deleting a camera is now part of the downgrade flow, so it must delete the archive too. Add `listImagesForCamera(cameraId)` to `Repos`; in `DELETE /api/v1/admin/cameras/:id`, read the image keys, delete the camera DB row (cascade), then call `storage.remove` for each key. Failed object removals are logged as orphans and do not block the deletion; the camera slot is freed. The admin confirmation must say that deleting a camera deletes its history. Never leave a DB row pointing to a removed object.

- [x] **Step 1: Write retention test** with fake repos/storage: 3 old rows, one failing object removal; expect all 3 DB rows deleted, 3 counted as removed, one orphan log, and new rows untouched.
- [x] **Step 2: Run** `npx vitest run packages/worker/test/retention.test.ts` — expect FAIL.
- [x] **Step 3: Implement storage remove, repo queries, and the purge job.**
- [x] **Step 4: Rewrite worker billing tests** for grace + zero-camera auto-cancel only; remove quantity-sync expectations.
- [x] **Step 5: Add the camera-delete cleanup route and an API test** proving the camera DB row is gone and objects are removed; a failed object removal logs an orphan but does not resurrect the camera.
- [x] **Step 6: Run** `npx vitest run packages/worker packages/api` and `npm run typecheck --workspace @ch/worker`.

**Status:** done — 72 worker tests and 102 API tests pass; worker typecheck/build pass; old quantity-sync test removed with the feature.

---

### Task 6: Admin billing and camera limit UI

**Files:**
- Modify: `packages/admin/src/Billing.tsx`, `packages/admin/src/App.tsx`, `packages/admin/src/api.ts`, `packages/admin/src/App.css`
- Modify: `packages/admin/src/test/Billing.test.tsx`, `packages/admin/src/test/App.test.tsx`

**Billing page structure:**
- Header: Billing + status pill.
- Summary row: current package + price, cameras `X / Y`, billing status.
- Usage bar: width `min(100, cameraCount / limit * 100)%`; `data-testid="camera-usage"`.
- Package grid: five cards (`data-testid="package-solo"` …). Each shows name, max cameras, `€X.XX / month`, "current" badge, "Select" button. Cards with `cameraCount > maxCameras` are disabled with text `Delete N cameras first`.
- Warning at/over limit: `You are using all N cameras. Upgrade to add more.`
- Buttons: `Save package` (or `Start billing` if no subscription), `Payments / invoices` (portal).
- Past due notice with grace date + `Update payment method` portal button.
- Pilot notice: free, no checkout.
- Remove free-month notices and all retention-tier tables.

**Camera editor:**
- Remove the `Retention plan` card and `form-plan` selector.
- Show a read-only row: `History · 12 months included`.
- In the camera list header, show `X / Y cameras`; disable `New camera` at limit with an upgrade link to `#/billing`.
- Delete-camera confirmation must warn that its history is deleted and the camera slot is freed. After deleting the last camera, show the existing 0-camera auto-cancel notice.
- Package cards and the summary show “12 months included” and `EUR, VAT included`; invoices/cancel/resume stay in the Stripe portal.

**Tests:**
- Billing renders package, price, `X / Y`, five cards, current badge.
- Selecting a package calls `POST /admin/billing/package`.
- Downgrade over limit is disabled and does not call the API.
- At limit, `New camera` is disabled.
- Camera editor no longer contains `form-plan`; contains `12 months`.

- [x] **Step 1: Update `api.ts` types and methods** (`getBilling`, `billingPackage`, `billingCheckout`, `billingPortal`).
- [x] **Step 2: Write failing tests** for package cards, usage, downgrade block, camera limit.
- [x] **Step 3: Implement `Billing.tsx` and `App.tsx` changes; add CSS using tokens.**
- [x] **Step 4: Run** `npx vitest run packages/admin` and `npm run typecheck --workspace @ch/admin`.

**Status:** done — 52 admin tests pass, typecheck/build pass. The new admin bundle was built for verification, but production `/admin/` was restored to the old bundle until the API cutover so the live admin does not call endpoints that are not deployed yet.
- [ ] **Step 5: Visual check** at 1440 and 390 px after the API cutover; deploy the new admin bundle then.

---

### Task 7: Landing pricing, FAQ, SEO, deck

**Files:**
- Modify: `packages/site/index.html`, `packages/site/src/site.css`
- Modify: `packages/site/deck/index.html`, `packages/site/src/deck.css`
- Modify: `packages/site/test/landing.test.ts`, `packages/site/test/seo.test.ts`, `packages/site/test/deck.test.ts`
- Regenerate: `packages/site/public/deck.pdf`

**Changes:**
- Hero proof: `History — 12 months`.
- Feature card: `A full year of history` / `Every plan keeps 12 months. No retention tiers.`
- Pricing: five package cards (not a 7-row table):
  - Solo €7.99 / 1 camera
  - Starter €13.99 / 3 cameras — mark `MOST POPULAR`
  - Plus €19.99 / 5 cameras
  - Pro €29.99 / 10 cameras
  - Network €49.99 / 25 cameras
- Copy: `EUR, per month, VAT included. Every package includes 12 months of history.`
- CTA: `Start with one camera` → mailto; keep live demo links.
- Admin: add `Sign in` to `/admin/` in the header and footer; add FAQ links.
- FAQ: `How long do you keep history?` (12 months on every plan), `What if I need more cameras?` (upgrade), `Can I downgrade?` (after deleting cameras), `Do you archive private cameras?` (no), `What happens when a camera is offline?`, `Can I cancel anytime?`.
- Remove all `per camera`, `14 days–36 months`, and retention-tier copy from both landing and deck.
- Deck: replace “Retention up to 36 months”, “EUR per camera”, and the 7-tier table with the five packages and 12 months; regenerate `packages/site/public/deck.pdf`.
- SEO JSON-LD `AggregateOffer`: `lowPrice: 7.99`, `highPrice: 49.99`, `offerCount: 5`.

- [x] **Step 1: Update tests** to assert five package names/prices, `12 months`, no `36 months`, FAQ, the new offer values, and the deck package rows.
- [x] **Step 2: Update HTML/CSS** using existing tokens and card patterns.
- [x] **Step 3: Regenerate the deck PDF** with `npm run deck:pdf --workspace @ch/site` and verify page count/visuals.
- [x] **Step 4: Run** `npm run build --workspace @ch/site`, `npx vitest run packages/site`, and `npm run design:check`.
- [x] **Step 5: Visual check** at 1440 and 390 px; no horizontal overflow, no old pricing strings (`grep -R "14 days\\|36 months\\|per camera" packages/site/index.html packages/site/deck/index.html`).

**Status:** done — 23 site tests pass, landing and deck build, deck PDF has 12 pages, mobile/desktop have no horizontal overflow. Landing, deck, backend and admin are live after the Task 8 cutover.

---

### Task 8: Stripe seed, env, docs, migration runbook

**Files:**
- Modify: `scripts/seed-stripe.mjs`, `README.md`
- Update server `.env` (not committed)

**Stripe seed:**
- One product `Camera History`, five monthly EUR prices, tax-inclusive:
  - `ch_solo` 799, `ch_starter` 1399, `ch_plus` 1999, `ch_pro` 2999, `ch_network` 4999 (cents).
- Archive the seven old prices (`active=false`) and remove old `STRIPE_PRICE_0_5`…`36` env keys.
- Print `STRIPE_PRICE_SOLO` … `STRIPE_PRICE_NETWORK`, portal config, webhook secret.

**README:**
- Replace M4 per-camera section with packages, camera limits, 1-year retention, no trial.
- Document `409 camera_limit_reached`, downgrade behavior, pilots, purge job.
- Remove `trial_claimed_at` instructions.

**Legal/GDPR:**
- Terms, privacy, DPA and AUP must say **12 months on every package** and package-based camera limits. Do not ship copy that promises 14 days–36 months or plan-based retention. Coordinate with the `Právo na webu` and `GDPR dokumenty` cards.

**Monitoring/ops:**
- Log purge batches (removed/failed), billing webhook failures, and `camera_limit_reached` responses. Check them after cutover. Keep the purge dry-run/log in the runbook.

**Migration runbook:**
1. Back up DB: `pg_dump` to `/home/ubuntu/backups/`.
2. Apply migration via API startup or `npm run db:migrate`.
3. Seed Stripe sandbox with the five new prices; cancel any sandbox subscriptions; copy env.
4. Rebuild/restart API + worker (`docker compose build api worker && docker compose up -d api worker`).
5. Manual checks: checkout Solo, add cameras to limit, try #limit+1 (409), upgrade, downgrade over limit (409), delete cameras, downgrade OK, portal invoice/cancel.
6. Run retention purge dry-run/log and verify only >12-month rows are candidates.

**Cutover sequence (pre-launch):**

```bash
# 1. backup
pg_dump "$DATABASE_URL" | gzip > /home/ubuntu/backups/camera-history-pre-packages.sql.gz
cp .env /home/ubuntu/backups/camera-history-pre-packages.env

# 2. tag current images for rollback (Compose image names are project-scoped)
docker compose images
docker tag "$(docker compose images -q api)" camera-history-api:pre-packages
docker tag "$(docker compose images -q worker)" camera-history-worker:pre-packages

# 3. build and start; API runs migrations at startup
docker compose build api worker
docker compose up -d api
docker compose logs -f api   # wait for migration + listening
docker compose up -d worker

# 4. seed Stripe, copy the five STRIPE_PRICE_* values + portal/webhook into .env
STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs
docker compose up -d api worker   # restart to pick up env

# 5. landing
npm run build --workspace @ch/site

# 6. smoke tests (manual)
```

**Rollback:**

- Restore the DB from the pre-packages dump.
- Restore `.env` from the backup.
- `docker compose down api worker && docker compose up -d api worker` using the previous commit (`git checkout <previous> && docker compose build api worker && docker compose up -d`). The `:pre-packages` tags are a fallback; retag them to the project image names reported by `docker compose images` before `up --no-build`.
- In Stripe, deactivate the five new prices and reactivate the seven old prices only if a rollback is required; there are no live subscriptions, so no customer billing is affected.
- Rebuild the landing from the previous commit (`git checkout <previous> -- packages/site`), or keep a copy of `packages/site/dist` before the cutover.

**Trello (manual, board is source of truth):**

- New card `Balíčky a 1letá retence` with checklist: core catalog, DB migration, API limits, Stripe prices, worker purge, admin UI, landing, PDF, smoke tests.
- Update `Admin — Billing — většina designu`: package cards, camera usage/limit, downgrade block, invoices/portal, grace.
- Update `Landing — většina designu`: five packages, 12 months, FAQ.
- Reopen or duplicate `Stripe — sandbox` as `Stripe — balíčky`; the old per-camera prices are archived.

- [x] **Step 1: Update seed script and run against sandbox** with `STRIPE_SECRET_KEY=sk_test_...`.
  - Done 19. 11. 2026: five prices `ch_solo_799` … `ch_network_4999`; seven old prices archived; `.env` and Compose use `STRIPE_PRICE_SOLO` … `STRIPE_PRICE_NETWORK`.
- [x] **Step 2: Update README and env documentation.**
  - M4 now describes packages, 12-month retention, no trial, `409 camera_limit_reached`, downgrade block, pilots and purge.
- [x] **Step 3: Run full gates:** `npm run typecheck && npm test && npm run lint && npm run build && npm run design:check`.
- [x] **Step 4: Execute the cutover sequence and smoke tests.**
  - DB backup: `/home/ubuntu/backups/camera-history-pre-packages-2026-11-19-1051.sql.gz`.
  - Migration `0011` applied; API and worker rebuilt/restarted; production healthy.
  - Smoke: five packages in the DTO, 3 cameras OK, 4th camera `409 camera_limit_reached`, checkout URL created, upgrade to Plus OK, downgrade to Solo `409 camera_limit_exceeded`, delete one camera, downgrade to Solo OK.
- [x] **Step 5: Update the Trello cards from the audit table; add the missing `Balíčky a 1letá retence` card; mark `Spočítat náklady` as done in the finance PDF.**
- [ ] **Step 6: Update terms/privacy/DPA/AUP to 12-month retention and package limits.**
  - Deferred to the `Právo na webu` and `GDPR dokumenty` cards; legal pages are not in this repo yet. Copy must say 12 months on every package and package-based camera limits.
- [x] **Step 7: Check purge, webhook and limit logs after cutover.**
  - Purge and webhook logs show no errors; `camera_limit_reached` and `camera_limit_exceeded` now emit structured warnings.

**Status:** done except legal copy, which is owned by the separate legal cards. The migration card is in Hotovo; Billing edge cases and live Stripe remain separate follow-ups.

---

## Definition of Done

- [x] Finance PDF is 2 pages and shows 25 300 Kč investment, 4 300 Kč monthly costs, 13 customers break-even, 12 326 Kč monthly profit, January 2028 payback.
- [x] `PACKAGE_TIERS` is the only pricing source; no `BILLING_TIERS`, `planMonths`, `trialClaimedAt`, `FREE_TRIAL_SLOTS`, or `FREE_TRIAL_DAYS` remain in application code.
- [x] Every tenant has `package_code`; all existing tenants are backfilled to the smallest fitting package.
- [x] Checkout creates one Stripe line item with quantity 1 for the selected package.
- [x] A 4th camera on Starter returns `409 camera_limit_reached`.
- [x] Downgrade over the camera limit returns `409 camera_limit_exceeded`; after deleting cameras, the downgrade succeeds.
- [x] Deleting a camera removes its DB rows first, then attempts MinIO object removal; failures are logged as orphans and do not resurrect the camera.
- [x] Public archives expose at most 12 months; the purge job deletes older images from DB and MinIO.
- [x] Landing and deck show five packages and 12 months everywhere; no retention tiers or 14 days–36 months strings remain.
- [ ] Legal copy (terms, privacy, DPA, AUP) states 12 months and package-based camera limits.
- [x] Trello cards from the audit are updated; the missing migration card exists and is sequenced before the Billing design.
- [x] Purge, webhook and camera-limit logs were checked after cutover.
- [x] All gates pass.

## Testing Matrix

| Layer | Command / check |
|---|---|
| Core catalog | `npx vitest run packages/core/test/billing.test.ts` |
| DB/repos | `npx vitest run packages/db` |
| API billing + limits | `npx vitest run packages/api/test/billing.test.ts packages/api/test/admin.test.ts` |
| Worker purge + grace | `npx vitest run packages/worker` |
| Admin UI | `npx vitest run packages/admin` |
| Landing/SEO | `npx vitest run packages/site` |
| Deck | `npx vitest run packages/site/test/deck.test.ts`; regenerate `deck.pdf` |
| Legal copy | `grep -R "36 months\\|14 days\\|per camera" packages/site/index.html packages/site/deck/index.html packages/site/src` → no hits in landing/deck/legal copy |
| Design | `npm run design:check` |
| PDF | `pdfinfo docs/finance-plan.pdf` → 2 pages; visual check |
| Trello | Audit cards updated; `Balíčky a 1letá retence` card exists and is sequenced before Billing design |
| Manual | Stripe sandbox checkout, upgrade, downgrade block, delete cameras, portal invoice/cancel, purge log |

## Out of Scope

- Annual billing, multi-currency checkout, regional price books.
- In-app invoice list (Stripe portal remains the invoice surface).
- Self-serve signup or card capture before checkout.
- Tax/VAT registration changes.
- Legal page implementation is separate (`Právo na webu`), but its copy must be updated to 12 months in Task 8.
- Migrating live Stripe subscriptions (none exist).

---

## Self-Review

- **Spec coverage:** packages (Task 2–7), camera limits/downgrade (Task 4, 6), 1-year retention (Task 2, 3, 5), trial removal (Task 4, 6), migration (Task 3, 8), PDF (Task 1), finance model 50 customers (Task 1).
- **No placeholders:** constants, types, endpoints, tests, and commands are specified. UI styling follows existing token patterns; exact JSX structure and test IDs are listed.
- **Type consistency:** `PackageCode`, `packageCode`, `PACKAGE_TIERS`, `RETENTION_MONTHS`, `cameraLimitForPackage`, `priceIdForPackage`, `packageForPriceId` are used consistently across tasks.
