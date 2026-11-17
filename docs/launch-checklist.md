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
- [ ] Documented role model: operator = controller; Camera History = processor for camera content and controller for account/billing
- [ ] Data map/ROPA and lawful-basis notes
- [ ] DPIA template available to operators
- [ ] Widget/group privacy notice link
- [ ] Operator terms and acceptable-use policy
- [ ] Data export/erasure/DSAR process tested
- [ ] Retention-deletion job verified for images, objects, CDN and backups
- [ ] Camera/tenant deletion verified to remove object-storage files
- [ ] Log retention and IP minimisation configured
- [ ] EU hosting/transfer notes and vendor DPAs
- [ ] Operator/company details, contact and VAT/tax information
- [ ] Refund, cancellation and cooling-off terms
- [ ] Email marketing consent and unsubscribe/suppression process
- [ ] Accessibility statement (EAA/WCAG/ADA as applicable)
- [ ] Local legal review before entering each market

## Content safety (NSFW v1: report-only)

- [ ] Acceptable-use categories documented
- [ ] Public report action on camera/group embeds
- [ ] Moderation queue with hide/quarantine
- [ ] Manual review, restore and audit log
- [ ] Operator notification
- [ ] Takedown SLA and appeal path
- [ ] CSAM/illegal-content escalation and evidence-preservation runbook
- [ ] No full automated scanning in v1; sampled scanning decision documented for later

## Backups & disaster recovery

- [ ] Postgres daily full + WAL/PITR; RPO 15 min, RTO 4 h
- [ ] MinIO/images daily offsite replication; RPO 24 h
- [ ] Encrypted offsite storage, object lock/immutability and separate credentials
- [ ] `.env`, Cloudflare, Stripe, DNS, TLS and deploy runbook backed up
- [ ] Monthly restore test and quarterly DR drill scheduled
- [ ] Alerting on failed backups and missed RPO
- [ ] GDPR erasure/retention policy covers backups
- [ ] Retention deletion covers object storage, Postgres, CDN and backup expiry
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
- [ ] Cache headers for images, day JSON, metadata, groups and admin APIs
- [ ] Image TTL 1 h, current-day JSON 60 s, historical JSON 24 h, 404/admin no-store
- [ ] Cloudflare cache rules and purge test
- [ ] Cache purge verified on camera/tenant deletion, NSFW block and GDPR erasure
- [ ] Font subsetting, preload and JS/CSS budgets
- [ ] Accessibility audit
- [ ] Security headers (CSP, HSTS, referrer policy)
- [ ] Uptime monitoring and error tracking
- [ ] Rate limits and abuse protections
- [ ] Capacity/load test at 20, 100, 500 and 1,000 cameras (60 min interval)
- [ ] Disk, DB growth and backup-window alerts configured

## Payments & tax

- [ ] Stripe account/entity ready for target markets
- [ ] Prices and currencies per market
- [ ] Tax registration and Stripe Tax configuration
- [ ] Invoices, receipts and tax IDs
- [ ] Local payment methods verified
- [ ] Refunds, dunning and grace periods tested
- [ ] Per-camera plan pricing connected

## Go-to-market

- [ ] 10–20 design partners identified; pilot terms accepted online
- [ ] First 20 subscriptions have the 30-day free month configured and tracked
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
- [ ] First 20 pilot host has offsite backups, monitoring and resource limits; no SLA
- [ ] Production server procurement deferred until load tests and storage forecast
- [ ] Production topology decision recorded: dedicated app host, managed DB, object storage and CDN
- [ ] No destructive disk cleanup without separate approval; Camera History volumes preserved
- [ ] Launch announcement and sales materials ready
