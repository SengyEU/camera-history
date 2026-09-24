# M4 — Billing: Stripe metered billing (per kamera) + self-serve tarify

> Status: schváleno uživatelem (sekce 1–4, 2026-09-24)
> Navazuje na: hlavní design doc `docs/superpowers/specs/2026-09-18-camera-history-saas-design.md` (§9 API, §13 cenová matice, §15 milníky)

## 1. Rozhodnutí (z brainstormingového dialogu)

- **Platební zpracování:** Stripe Billing (Subscription API).
- **Fakturační model:** metered billing — 1 Price per retenční tier (`per_unit`, `usage_type: metered`, €/kamera/měsíc); usage = aktuální počet kamer tenanta.
- **Upgrade/downgrade:** self-serve v adminu. Změna tarifu probíhá přes Stripe Checkout (sub/modifica), správa plateb a odhlášení přes Stripe Customer Portal.
- **Stropy:** pouze retence (stupeň 14 dní–36 měsíců; strop dle ceníku je 36 m). **Počet kamer bez limitu** — metered cena roste automaticky. Žádné blokace kamery počtem kamer.
- **Neliquidní faktury:** hard stop — `past_due` + grace 3 dny → deaktivace kamer (`enabled=false`), tenant `unpaid`. Reaktivace přes checkout → kamery zpět `enabled=true`.
- **Onboarding k Stripe:** registrace (register endpoint) vytvoří Stripe Customer + okamžitě Checkout session (výběr tarifu a platební metody). Existující tenanti bez sub = `billing_status=none`, admin Billing stránka je vybídne k aktivaci.

## 2. Stack a klíčová rozhodnutí

- `stripe` Node SDK (oficiální), bez `Elements` — checkout/portal přes server-redirect (žádný public key embedding; YAGNI).
- Nová DB tabulka — sloupce na `tenants` (1:1, není samostatná tabulka):
  - `stripe_customer_id text NULL`
  - `stripe_subscription_id text NULL`
  - `billing_status enum('none','active','past_due','unpaid','canceled') NOT NULL DEFAULT 'none'`
  - `billing_grace_until timestamptz NULL`
- `plan_months` převeden z `integer` na `numeric(4,1)` — stupeň 14 dní = `0.5`; ostatní stupně 1/3/6/12/24/36.
- `retentionCutoff(months)` upravit: povolit `months >= 0.5` (dřív `>= 1`), 0.5 → 14 dní.
- Config (`packages/core`): `stripe.enabled`, `stripe.secretKey`, `stripe.webhookSecret`, `stripe.prices` (tier→price_id mapování z env `STRIPE_PRICE_<MONTHS>`; přeladitelný ceník dle §13), `billing.graceDays` (default 3).
- Capture/worker: rozšířený worker job pro *metering* (report kamer, hodinový tick) + *grace check* past_due (deaktivace) — viz sekce 4/5.
- Cenová matice (€/kamera/měsíc, ceník přeladitelný):
  | retence | plan_months | €/kamera/měsíc |
  |---|---|---|
  | 14 dní | 0.5 | 5 |
  | 1 měsíc | 1 | 9 |
  | 3 měsíce | 3 | 15 |
  | 6 měsíců | 6 | 22 |
  | 12 měsíců (default) | 12 | 29 |
  | 24 měsíců | 24 | 49 |
  | 36 měsíců (strop) | 36 | 69 |

- WP plugin zdarma (beze změny, M3).

## 3. Datový model

### `tenants` (migrace 0002)

```diff
- planMonths: integer NOT NULL DEFAULT 12
+ planMonths: numeric(4,1) NOT NULL DEFAULT 12
+ stripeCustomerId: text NULL
+ stripeSubscriptionId: text NULL
+ billingStatus: billing_status NOT NULL DEFAULT 'none'   -- pgEnum('none','active','past_due','unpaid','canceled')
+ billingGraceUntil: timestamptz NULL
```

- `plan_months` řídí `retentionCutoff` (dnes). Stupeň 14 dní = `0.5`.
- `billing_status` stav zrcadlí Stripe subscription.status (`active`, `past_due`, `unpaid`, `canceled`) a `none` pro tenanty bez Stripe.

### `retentionCutoff` — poznámka

Současné: `if (months < 1) throw RangeError`. Nově: `if (months < 0.5) throw RangeError` (0.5 = 14 dní). Implementace v `packages/core/src/retention.ts`.

## 4. Datové toky

### 4.1 Registrace → Stripe Customer + Checkout

`POST /api/v1/auth/register` (upraveno):
1. Vytvoří tenant + user (jako dnes; `plan_months` dle configu default 12m).
2. Pokud `STRIPE_ENABLED=true`:
   - `stripe.customers.create({ metadata: { tenantId } })` → uložit `stripe_customer_id`.
   - Vytvořit Checkout Session (mode `subscription`, line item = default tier price „12 m" metered, `client_reference_id` = tenantId, `metadata.tenantId`).
3. Response `201` rozšířit o:
   ```json
   { "status": "created", "tenantId": "...", "billing": { "required": true, "checkoutUrl": "https://checkout.stripe.com/..." } }
   ```

### 4.2 Zobrazení stavu pro Billing stránku

`GET /api/v1/admin/billing` (auth):
- reply:
  ```json
  {
    "planMonths": 12,
    "price": 29,
    "billingStatus": "none",
    "stripeCustomerId": null,
    "graceUntil": null,
    "cameraCount": 3,
    "usageBytes": 1234567,
    "storageBytes": 14814804,
    "billingEnabled": true
  }
  ```
- `price` = lookup z ceníku (config `stripe.prices`) podle `plan_months` (pouze celočíselné/definované stupně).
- `usageBytes` = `SUM(size_bytes)` aktivních snímků tenanta (přes repo). `storageBytes` = hrubý odhad `usageBytes × planMount * 30`? — raději **počítáme přesně jednoduše:** `usageBytes` = suma posledních snímků? (v M4 stačí suma size_bytes bez retenčního odhadu; `storageBytes` je informative a počítá se `usageBytes / 30 * planMonths*30` vevýznamu „odhad velikosti při plné retenci" — popíšeme v impl). Zni: `usageBytes` = aktuální `SUM(size_bytes)` v `images` (všechny, ne retenčně omezené); `storageBytes` = odhad přes průměrný denní nárůst `×30×planMonths`. (Detail v impl plan.)
- `billingEnabled` = `cfg.stripe.enabled`.

### 4.3 Checkout pro upgrade/downgrade

`POST /api/v1/admin/billing/checkout` body `{ planMonths }` (auth):
- Whitelist: `[0.5, 1, 3, 6, 12, 24, 36]`; jinak 400 `invalid_plan_months`.
- Neplatný tier neznámý v `stripe.prices` → 400 `invalid_plan_months`.
- `stripe.checkout.sessions.create` (mode `subscription`):
  - Bez sub → line item = price tier.
  - S existující sub → `subscription_data.items[0].price` = nová price; Stripe prorátuje metered item automaticky (upgrade se projeví na příští faktuře). Rozhodnutí: nedirigujeme` prorace ručně — pro metered usage Stripe sumarizuje na konci cyklu; `subscription.updated` webhook pak z synchronizuje `plan_months`.
  - `metadata.tenantId` + `client_reference_id` = tenantId.
  - `success_url` = `{adminBase}/#/billing?paid=1`; `cancel_url` = `{adminBase}/#/billing?pay=cancelled`.
- reply `{ url }`.

### 4.4 Stripe Customer Portal (platby, faktury, odhlášení)

`POST /api/v1/admin/billing/portal` (auth):
- `stripe.billingPortal.sessions.create({ customer: tenant.stripeCustomerId, returnUrl: {adminBase}/#/billing })`
- reply `{ url }`.
- Předpoklad: `billing_portal.configuration` umožňuje změnu platební metody, faktury, a **zrušit subskripci** (odhlášení). Potvrď v Stripe dashboardu; jinak nastavit přes API v seed skriptu (idempotentní config create).

### 4.5 Webhook (bez auth, signature verify)

`POST /api/v1/billing/webhook`:
- `stripe.webhooks.constructEvent(body, sig, webhookSecret)`; nevalidní → 401.
- Impdv = tenant je identifikován přes `client_reference_id` (Checkout) nebo `subscription.metadata.tenantId` (create sub s metadata) — rozhodnutí: **při vytvoření sub (Checkout) dávat `metadata.tenantId` na subscription** (ne jen session). Pak webhooky subscription: události `customer.subscription.updated/deleted` mapují podle `subscription.metadata.tenantId` → spolehlivé.
- Handlery:
  - `checkout.session.completed` → tenant z `session.metadata.tenantId`; uložit `stripe_customer_id` (z session.customer), `stripe_subscription_id` (z session.subscription), `billing_status='active'`, `plan_months` z price tier (lookup `stripe.prices` reverse).
  - `customer.subscription.updated` → podle `subscription.metadata.tenantId`: nastavit `billing_status` dle `subscription.status`.
    - → `active`/`trialing` → clear `billing_grace_until`; pokud byl tenant `past_due`/`unpaid` → reaktivace kamer (`UPDATE cameras SET enabled=true`) — single transaction.
    - → `past_due` → `billing_grace_until = now + graceDays`.
    - → `unpaid`/`canceled`/`incomplete_expired` → `billing_status=unpaid|canceled`.
  - `customer.subscription.deleted` → `billing_status='canceled'` + deaktivace kamer (`enabled=false`).
- Idempotence: eventové retry — vždy upsert podle `stripe_subscription_id`; opakovaný event = no-op (stav se jen znovu zapíše).
- Pozn: konflikt price-tier v `subscription.updated` (když Stripe proproruje na jinou price) → `plan_months` se přepíše tabulkovou valuací nové price. (Detaily v impl.)

## 5. Worker (metering + hard stop)

Rozšíření worker na **2 joby** (`packages/worker/src/billing.ts`):

1. **UsageReportJob** — běží na worker ticku (`tickMs`, default 60 s), ale **damuje volání Stripe**: reportuje usage jen pro tenanty `billing_status='active'` s rozestupem ≥ 1 h na tenant (sleduje přes repo/lastReportedAt nebo jednoduchou timestamp mapu v paměti jobu):
   - `repos.countCameras(tenantId)` → `stripe.subscriptionItems.list({ subscription })` → vytvořit **metered usage record** `stripe.usageRecords.create({ subscriptionItem, quantity: cameraCount, timestamp })`.
   - Stripe sumarizuje quantity do fakturačního období (per_unit metered price).
2. **GraceCheckJob** (v tomtéž ticku):
   - Tenanty `billing_status='past_due' && billing_grace_until < now` → hromadný `UPDATE cameras SET enabled=false WHERE tenant_id=...` (single transakce) + `billing_status='unpaid'`.
   - Retry: žádné automatické opětovné enable — jen přes webhook `active` (reaktivace).

Oba joby idempotentní; při `stripe.enabled=false` se UsageReportJob přeskočí (no-op), GraceCheckJob běží dál (deaktivace není závislá na Stripe).

### worker deaktivace — kamery `enabled` flag

Hard stop přepíše `enabled` na `false` **pro všechny kamery tenanta**; při reaktivaci se kamery nastaví `enabled=true` (původní per-kamera stav se neuchovává — design: restart do default enabled).

## 6. API specifikace

| Method | Path | Auth | Body | Reply | Pozn. |
|---|---|---|---|---|---|
| POST | `/api/v1/billing/webhook` | signature | raw | 200 | webhook |
| GET | `/api/v1/admin/billing` | JWT | – | viz 4.2 | stav |
| POST | `/api/v1/admin/billing/checkout` | JWT | `{planMonths}` | `{url}` | 4.3 |
| POST | `/api/v1/admin/billing/portal` | JWT | – | `{url}` | 4.4 |
| POST | `/api/v1/auth/register` | – | (rozšíř) | `{status, tenantId, billing}` | 4.1 |

Chyby: RFC 7807 (jako zbytek API). `billing_disabled` → kdykoliv Stripe vypnut (409). `invalid_plan_months` 400. Webhook bad sig 401.

## 7. Admin UI (Billing stránka)

`packages/admin`:
- Nová stránka `/billing` (route + sidebar odkaz).
- Data z `GET /api/v1/admin/billing` (v `api.ts`).
- Komponenty:
  - `BillingStatusBadge` (none=šedý, active=zelený, past_due=žlutý, unpaid/canceled=červený).
  - `PlanCard` (aktuální tier + cena/kamera).
  - `CameraCount` + shortcode info (z `GET /admin/cameras`).
  - `UsageStats` (`usageBytes`, `storageBytes` → humanizovaná).
  - `PlanSelect` (radio tierů) + tlačítko **Změnit tarif** → `POST checkout`.
  - Tlačítko **Platby / faktury** → `POST portal`.
  - Alert banner: `past_due` (grace countdown), `unpaid`/`canceled` („Znovu aktivovat" → checkout).
- Stripe UI: redirekt (server session). Bez `@stripe` frontend package.

## 8. Error handling

- Stripe disabled → billing endpointy dle tabulky; stránka banner „platby nejsou zapnuté".
- Webhook bad sig → 401, nezalogovat payload (PII).
- Checkout cancelled → žádná změna DB; redirect `?pay=cancelled`.
- Chyba Stripe API → `HttpError(502, 'stripe_error', message)` (RFC 7807).
- Idempotence webhooků → upsert podle `stripe_subscription_id`.
- Neznámý tier → 400.
- past_due + grace uplynuto → hromadná deaktivace v transakci; replikace: žádná (jen webhook `active`).
- `retentionCutoff` s `0.5` → nové minimum je 0.5 (14 dní); nižší = RangeError.

## 9. Testy

- Unit (`@ch/core`):
  - `retentionCutoff({months: 0.5})` → cutoff ~14 dní; `0.4` → RangeError.
  - price lookup z ceníku (tier→€, reverse lookup €→tier).
- Integration (`@ch/api` s fake repos + mocked Stripe klient):
  - register → fake Stripe customer + checkout url v odpovědi (když enabled), bez Stripe → bez billing bloku.
  - webhook `subscription.updated` active/past_due/deleted → repo stav + grace + kamery enabled/disabled.
  - webhook `checkout.session.completed` → planMonths z price.
  - checkout endpoint: valid/invalid planMonths, upgrade vs downgrade (mocked Stripe volání), Stripe disabled → 409.
  - portal endpoint → mocked billingPortal session url.
  - GraceJob: past_due+grace past → deaktivace + unpaid.
- Worker:
  - UsageReportJob reportuje quantity=cameraCount přes mocked Stripe usageRecords.create.
- API webhook signature: konstrukce `Stripe-Signature` testovacího payloadu vs stub secret.
- Admin UI (RTL): Billing stránka render (mocked `api.ts`), bannery past_due/unpaid.

Test framework: Vitest (stávající), mocking přes `vi.mock('stripe'...)`.

## 10. Out of scope (M4)

- Blokační limity počtu kamer (žádné — metered).
- Fakturace dle reálného `size_bytes` (jen metrika, ne cena).
- Stripe Elements / inline platební formulář.
- White-label, kredity, kupony, free trial (trialing neřešíme — Stripe default bez trial).
- Deaktivace per-kamera (jen celý tenant).
- Samostatná cena per feedType.
- Měnové konverze (pouze EUR).

## 11. Milníky / postup (impl plan pokryje)

1. `@ch/core`: config (stripe/billing), ceník, `retentionCutoff` 0.5, `billing.ts` helpery.
2. `@ch/db`: migrace 0002 (plan_months numeric, billing sloupce, billing_status enum), repo funkce (`getTenantBilling`, `countCameras`, `sumUsageBytes`, `disableTenantCameras`, `enableTenantCameras`, `setBillingState`, upsert sub), fakeRepos rozšířit.
3. `@ch/api`: Stripe modul (klient init), auth.register rozšířit, routes billing (GET/checkout/portal), webhook route, reverse lookup ceníku.
4. `@ch/worker`: billing joby (usage + grace) v ticku.
5. `@ch/admin`: Billing stránka + api.ts + navigace.
6. Seed skript: idempotentní tvorba Products/Prices/BillingPortal config (samostatný `scripts/` nebo worker)? — rozhodnutí: samostatný skript `scripts/seed-stripe.mjs` (Node, CLI), dokumentace v README. (Detail v impl plan.)
7. Testy + repo gaty + README M4.

## Definition of Done (summary)

- Migrace 0002 aplikovaná; `plan_months` numeric a stave 0.5 funkční v retenci.
- Stripe metered: register→checkout, checkout upgrade/downgrade, portal, webhook status sync, usage records report.
- Worker: past_due+grace → deaktivace kamer; reaktivace přes webhook.
- Admin Billing stránka (tarif, stav, usage, portal, checkout).
- Stripe disabled → plný provoz bez plateb.
- Testy: unit+integration+UI, repo gaty PASS.
- README M4 sekce (env vars, seed, portal config, test click-through stripe test mode).