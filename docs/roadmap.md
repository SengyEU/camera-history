# Camera History — Product & Market Roadmap

Status: living document. Current product work stays in the implementation plan; this file captures the longer-term programme.

## Guiding principles

- Trust first: backups, security and legal foundations before asking customers to rely on the archive.
- Final brand before launch: all public links, embeds and outreach must point to `camera-history.com`, not the old working domain.
- Direct outreach beats broad launch theatre for this B2B niche.
- No paid ads, no generic developer/startup launch sites, no spam.
- "All countries" is not a single switch; expand market by market after the first paying customers.
- Legal compliance and payment coverage require local counsel and local providers.
- Every new UI follows `docs/design-system.md`.

## Phase 0 — Product finish (done)

- Per-camera retention plans, group editor, drag ordering, per-camera 12/24h format.
- Montserrat design system, tokens and `design:check`.
- Demo pages removed; `/demo/` returns 410.

## Phase 1 — Trust & reliability foundations

- Terms of service, privacy policy, cookie policy, DPA, operator/company details.
- Refund/cancellation terms, acceptable use, retention and deletion policy, subprocessor list.
- Cookie consent only for non-essential cookies (auth cookies are strictly necessary).
- **Backups and disaster recovery:**
  - Postgres: daily full + WAL/PITR, **RPO 15 min, RTO 4 h**.
  - MinIO/images: daily offsite replication, **RPO 24 h**; versioning/object lock and checksums.
  - Encrypted offsite storage with separate credentials; backup `.env`, Cloudflare, Stripe, DNS and the deploy runbook.
  - Monthly restore test, quarterly DR drill, alerting on failed backups.
  - GDPR retention and erasure must also cover backups; publish a backup & security policy as a sales asset.
- Uptime/error monitoring, status page, support channels and incident process.
- Search Console verification, sitemap submission and indexation monitoring on the final domain.

## Phase 1.5 — Domain migration to camera-history.com

**Gate before any pilot outreach, case studies, directory listings or public launch materials.**

- Canonical `https://camera-history.com` (apex); `www` 301 to apex.
- New Cloudflare zone, DNS, origin certificate and nginx server block.
- Old `camera.sengycraft.cz`: app retired, **301 redirect** to the new domain for at least 12 months (SEO/backlinks). It is not an active app domain.
- Demo/test embeds only, so no dual-origin compatibility layer is required; all known snippets/tests must be updated before cutover.
- Update `PUBLIC_BASE_URL`, `embed.js` origin, site canonical/OG/JSON-LD, sitemap/robots, README/scripts, WordPress plugin defaults, Stripe webhook and return URLs, Search Console Change of Address, e-mail DNS/signatures and legal documents.
- Host-only auth cookies mean users re-login once on the new domain; the JWT secret stays the same.
- Detailed runbook: `docs/domain-migration.md`.

## Phase 2 — Pilot partners + direct outreach

- **10–20 design partners**: first camera operators using the product in a 30-day pilot or at a discounted first-year rate. The first **20 new subscriptions** receive one month free automatically.
  - Personal onboarding, feedback, case study and testimonial.
  - Convert to paid after the pilot; no indefinite free accounts.
- Build a lead database of 200–500 static-camera operators: ski resorts, marinas, attractions, construction and weather/nature networks.
- Personalised outreach: specific camera/page observation, one-sentence pitch, demo link, 3–5 follow-ups, CRM and opt-out.
- **No paid ads.**
- **No developer/startup launch sites** (Product Hunt, Betalist, DevHunt, Hacker News, Indie Hackers, Peerlist, etc.).
- **Niche communities only**: resort/tourism/webcam groups, LinkedIn operator groups; respect each community's self-promotion rules.
- Partnerships are opportunistic backlog, not a dedicated phase.
- Success is measured by activations and revenue, not generic signups.

## Phase 3 — Billing v1 (EU/Stripe)

- Per-camera plans connected to real pricing.
- Stripe subscriptions, invoices, tax, dunning, refunds, trial and grace period.
- Self-service plan changes and activation/deactivation.
- Conversion funnel and unit economics (price vs. storage/CDN cost).

## Phase 4 — Niche visibility + content

- Case studies from design partners, relevant niche communities and targeted pages (webcam archive, resort webcam, embeddable history).
- No 50 generic AI articles; quality and first-hand experience over volume.
- SEO/launch checklist only after domain, legal and backups are stable.
- No paid ads; revisit only with proven conversion and unit economics.

## Phase 5 — International expansion

- i18n for landing, widget, admin, emails and legal documents.
- Localised routes, `hreflang`, dates/numbers/timezones, RTL where needed.
- Multi-currency, Stripe Tax, local payment methods and market-specific compliance.
- Local counsel review before entering each market.

## Phase 6 — Scale & operations

- Support/SLA, status page and incident process.
- DR drills, storage/CDN capacity and unit economics.
- Legal entities, accounting, payouts and localised support.
- Partner/reseller programme only if demand proves it.

## Metrics

- **Primary milestone: 1000 activated cameras** (not 1000 signups).
- Funnel: targeted accounts → replies → demos → pilots → activated cameras → paid cameras → MRR.
- Retention/churn, cameras per tenant, storage cost per camera.
- Backup health: last successful backup, RPO/RTO, restore test result.

## Deliberately excluded

- Paid ads before proven conversion and unit economics.
- Generic developer/startup launch sites and directory blasts.
- AppSumo/lifetime deals in the early stage.
- 50 AI-generated blog posts or thin programmatic pages.
- Mass Reddit/Facebook spam.
- A formal partnership programme before paying demand.

## Later / backlog

- Privacy-friendly analytics and product metrics.
- Self-service onboarding improvements and additional embed options.
- Referral programme, partner/reseller programme.
- Additional markets after the first paying cohort.
