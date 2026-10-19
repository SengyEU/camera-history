# Camera History — Product & Market Roadmap

Status: living document. Current product work stays in the implementation plan; this file captures the longer-term programme.

## Guiding principles

- Ship the product first, then launch foundations, then international expansion.
- "All countries" is not a single switch. Each market has its own legal, tax, payment and language requirements.
- Prefer a phased rollout: EU + English first, then North America, then other markets based on demand.
- Legal compliance and payment coverage require local counsel and local providers; engineering alone cannot guarantee them.

## Phase 0 — Current product work

- Per-camera retention plans (nullable camera plan, inherit tenant by default).
- Group camera ordering and the group editor (preview left/right layout, embed code).
- Hide storage-size metrics from the admin UI.

## Phase 1 — Launch foundations

- Terms of service, privacy policy, cookie policy, DPA, operator/company details.
- Refund/cancellation terms, acceptable use, retention and deletion policy, subprocessor list.
- Cookie consent only for non-essential cookies (auth cookies are strictly necessary).
- Search Console verification, sitemap submission, indexation monitoring.
- Final technical SEO, performance, accessibility, security headers, backups, uptime and error monitoring.

## Phase 2 — Internationalisation

- i18n for the landing page, widget, admin, emails and legal documents.
- Localised routes (`/de/`, `/fr/`, ...), `hreflang`, correct `lang`, localised dates/numbers/timezones, RTL where needed.
- Widget language via `?lang=` and the host page language; embed script can forward it.
- Human legal review per market; machine translation is not sufficient for contracts.

## Phase 3 — Global payments and currencies

- Multi-currency pricing, Stripe Prices per currency, local rounding.
- Stripe Tax / VAT / sales tax, tax IDs, invoices, OSS/IOSS, reverse charge.
- Local payment methods by market: cards, SEPA, iDEAL, Bancontact, BLIK, Przelewy24, Klarna, Apple/Google Pay, Alipay/WeChat Pay, etc.
- Stripe Payment Element and local methods; verify Stripe availability and whether a local entity or PSP is needed.
- Dunning, refunds, grace periods, plan changes, monthly/annual billing, coupons and trials.
- Connect per-camera plans to real price calculation.

## Phase 4 — Global compliance

- Market matrix: GDPR/UK GDPR, CCPA/CPRA, LGPD, PIPL, APPI, DPDP and others as markets are added.
- Consumer law, distance selling, cooling-off, refunds, accessibility (EAA/WCAG/ADA).
- Email marketing: GDPR/ePrivacy, CAN-SPAM, CASL, opt-in, unsubscribe, suppression list.
- DPA, subprocessors, SCCs, data residency, retention, export and deletion.
- Local counsel review before entering each market.

## Phase 5 — Go-to-market and outreach

- Build a lead database of static-camera operators: ski resorts, beaches, marinas, tourist attractions, construction sites, weather/nature networks.
- Capture country, type, website, contact email, language, live camera URL and decision-maker.
- Prepare sales materials: offer, deck, live demo, pricing, case studies, email sequences, follow-ups.
- CRM, tracking, A/B tests and compliant B2B outreach per jurisdiction.
- Roll out market by market, not all countries at once.

## Phase 6 — Scale and operations

- Support, SLA, status page and incident process.
- Monitoring, backups, disaster recovery, storage/CDN capacity and unit economics.
- Legal entities, accounting, payouts, taxes and localised support.

## Later / backlog

- Analytics and product metrics (privacy-friendly, consent-aware).
- Self-service onboarding improvements, additional widget themes and embed options.
- Partner/reseller programme.
