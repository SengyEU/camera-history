# Camera History — Final Launch Checklist

This checklist is executed before public launch, after product features are complete and after the domain migration. It is not part of the current admin work.

## Domain (camera-history.com)

- [ ] Apex `https://camera-history.com` canonical; `www` 301 to apex
- [ ] New Cloudflare zone, DNS and origin certificate
- [ ] Old `camera.sengycraft.cz` returns 301 path-preserving; app retired
- [ ] `PUBLIC_BASE_URL`, `embed.js` origin, site canonical/OG/JSON-LD/sitemap/robots updated
- [ ] Admin, widget, group and embed snippets verified on the new domain
- [ ] Stripe webhook and return URLs updated
- [ ] Search Console new property, sitemap and Change of Address
- [ ] `hello@camera-history.com` + personal outreach mailbox, SPF/DKIM/DMARC, old address forwarded
- [ ] Legal documents and e-mail signatures use the new domain
- [ ] Full runbook: `docs/domain-migration.md`

## Legal & compliance

- [ ] Terms of service (initial market; per market where required)
- [ ] Privacy policy / GDPR information
- [ ] Cookie policy and consent management (non-essential cookies only)
- [ ] Data processing agreement (DPA) and subprocessor list
- [ ] Operator/company details, contact and VAT/tax information
- [ ] Refund, cancellation and cooling-off terms
- [ ] Acceptable use and retention/deletion policy
- [ ] Data export and erasure process
- [ ] Email marketing consent and unsubscribe/suppression process
- [ ] Accessibility statement (EAA/WCAG/ADA as applicable)
- [ ] Local legal review before entering each market

## Backups & disaster recovery

- [ ] Postgres daily full + WAL/PITR; RPO 15 min, RTO 4 h
- [ ] MinIO/images daily offsite replication; RPO 24 h
- [ ] Encrypted offsite storage, object lock/immutability and separate credentials
- [ ] `.env`, Cloudflare, Stripe, DNS, TLS and deploy runbook backed up
- [ ] Monthly restore test and quarterly DR drill scheduled
- [ ] Alerting on failed backups and missed RPO
- [ ] GDPR erasure/retention policy covers backups
- [ ] Public backup & security policy page
- [ ] Final backup before launch

## Search Console & SEO

- [ ] Verify `camera-history.com` in Google Search Console
- [ ] Submit `https://camera-history.com/sitemap.xml`
- [ ] Confirm only `/` is indexed; widget/group/admin/deck excluded; `/demo/` returns 410
- [ ] Change of Address from the old property
- [ ] Check Coverage/Pages and fix unexpected exclusions
- [ ] Review Core Web Vitals and mobile usability
- [ ] Request indexing for the landing page after launch
- [ ] Verify OG/Twitter previews and canonical URLs

## Performance & reliability

- [ ] Lighthouse/PSI audit (mobile + desktop)
- [ ] LCP/INP/CLS within thresholds
- [ ] Image optimisation, caching/CDN, compression
- [ ] Font subsetting, preload and JS/CSS budgets
- [ ] Accessibility audit
- [ ] Security headers (CSP, HSTS, referrer policy)
- [ ] Uptime monitoring and error tracking
- [ ] Rate limits and abuse protections

## Payments & tax

- [ ] Stripe account/entity ready for target markets
- [ ] Prices and currencies per market
- [ ] Tax registration and Stripe Tax configuration
- [ ] Invoices, receipts and tax IDs
- [ ] Local payment methods verified
- [ ] Refunds, dunning and grace periods tested
- [ ] Per-camera plan pricing connected

## Go-to-market

- [ ] 10–20 design partners identified; pilot terms agreed
- [ ] Lead database of 200–500 camera operators with country, type, site, contact and language
- [ ] Personalised outreach templates + 3–5 follow-ups + opt-out
- [ ] CRM and UTM/attribution tracking
- [ ] Demo links, deck, pricing and case-study template ready
- [ ] **No paid ads**
- [ ] **No developer/startup launch sites** (Product Hunt, Betalist, DevHunt, Hacker News, Indie Hackers, Peerlist…)
- [ ] Niche community plan with self-promotion rules respected
- [ ] Success dashboard: replies → demos → pilots → activated cameras → paid cameras

## Operations

- [ ] Support channels and response times
- [ ] Status page / incident contact
- [ ] Rollback plan
- [ ] Launch announcement and sales materials ready
