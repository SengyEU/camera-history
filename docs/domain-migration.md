# Camera History — Domain Migration Runbook

**From:** `camera.sengycraft.cz`  
**To:** `camera-history.com` (apex canonical; `www` 301 to apex)  
**Scope:** full cutover. Old domain becomes a redirect only and is not an active app domain.

This runbook is executed before pilot outreach and before any public/case-study material is published.

## 1. Preconditions

- [ ] `camera-history.com` is registered and owned by the operator.
- [ ] Cloudflare zone is active; DNS and origin certificate are ready.
- [ ] Old domain has only demo/test data and no real customer embeds that must keep working. Any known demo/test embeds are updated before cutover.
- [ ] A fresh database/object backup exists and has been verified.
- [ ] There is access to: Cloudflare, DNS registrar, Stripe dashboard, Google Search Console, e-mail/DNS, server/nginx, GitHub/deploy.

## 2. Decisions

| Item | Decision |
|---|---|
| Canonical | `https://camera-history.com` (apex) |
| `www` | `301` to apex |
| Old domain | `301` to the new domain for at least 12 months; app retired |
| E-mail | `hello@camera-history.com` for site/general; personal founder address for outreach; old address forwarded |
| Embed compatibility | Demo/test only; update all snippets, no dual-origin layer |
| Auth | Host-only cookies; users re-login once; JWT secret unchanged |

## 3. Inventory before the cutover

Run a repository-wide search and update every match:

```bash
grep -rn "camera\.sengycraft\.cz" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
```

Expected areas:

- `.env`, `.env.example`, `PUBLIC_BASE_URL`.
- `deploy/nginx/*`, server names, log names, certificate paths.
- `packages/site/index.html` canonical, OG, Twitter, JSON-LD.
- `packages/site/public/sitemap.xml`, `robots.txt`.
- `packages/site/public/embed.js` `ORIGIN`.
- `packages/web` warning text and tests.
- `packages/site/test/seo.test.ts` and related tests.
- `packages/wp-plugin` default base URL, `CH_EMBED_URL`, settings placeholder and harness.
- README, scripts, docs, e-mail signatures and sales material.
- Stripe webhook and checkout/portal return URLs.
- Search Console, Cloudflare, uptime/error monitoring and any analytics.

## 4. Backups before DNS

- [ ] Postgres full backup + WAL/PITR available; RPO 15 min / RTO 4 h target.
- [ ] MinIO/object offsite replication available; RPO 24 h target.
- [ ] `.env`, Cloudflare zone/DNS, Stripe configuration, TLS material and nginx config backed up outside the repo.
- [ ] Restore test performed or verified within the last month.

## 5. Cloudflare, DNS and TLS

1. Create the `camera-history.com` zone in Cloudflare.
2. Add apex A/AAAA (or Cloudflare-proxied equivalent) to the origin.
3. Add `www` CNAME and redirect `www` → apex.
4. Issue/attach the origin certificate and install it on the server.
5. Configure cache rules that must survive: `/embed.js` bypass/no-cache, HTML dynamic, static assets cached.
6. Keep the old zone active with a redirect rule to the new domain; do not point it at the old app after cutover.

## 6. Nginx

- New server block: `server_name camera-history.com www.camera-history.com;` with the same routes as the old app.
- Old server block: return `301 https://camera-history.com$request_uri;` for all paths (path and query preserved).
- Keep the noindex headers for `/admin/`, `/widget/`, `/group/`, `/deck/`, `/deck.pdf`; keep `/demo/` 410.
- `sudo nginx -t && sudo systemctl reload nginx`.

## 7. Application configuration

- Set `PUBLIC_BASE_URL=https://camera-history.com` in production `.env`.
- Update `packages/site/public/embed.js` ORIGIN to `https://camera-history.com`.
- Update site canonical/OG/Twitter/JSON-LD/sitemap/robots.
- Update README, demo data, screenshot script and WordPress plugin defaults/placeholders.
- Update tests that hardcode the old domain.
- Build and deploy site/admin/web; rebuild/restart API and worker with the new env.
- Regenerate the deck PDF and admin screenshots if URLs or screenshots changed.

## 8. Stripe

- [ ] Webhook endpoint → `https://camera-history.com/api/v1/billing/webhook`.
- [ ] Checkout success/cancel URLs and customer portal return URLs use the new domain.
- [ ] `PUBLIC_BASE_URL` used by the billing gateway points to the new domain.
- [ ] Test checkout, webhook and portal in test mode.

## 9. E-mail and legal

- [ ] Create `hello@camera-history.com` and the personal outreach mailbox.
- [ ] Configure SPF, DKIM and DMARC for the new domain.
- [ ] Forward `hello@sengycraft.cz` to the new address.
- [ ] Update terms, privacy, DPA, cookies, operator details and e-mail signatures.
- [ ] Update social profiles and e-mail templates.

## 10. Search Console

- [ ] Verify the old property (if not already verified).
- [ ] Add and verify `camera-history.com`.
- [ ] Submit `https://camera-history.com/sitemap.xml`.
- [ ] Use **Change of Address** from the old property to the new one.
- [ ] Keep the old property and 301 redirects for at least 12 months.
- [ ] Monitor Coverage/Pages, CWV and 404s after cutover.

## 11. Cutover QA

- [ ] `https://camera-history.com/` 200; `/admin/`, `/deck/` 200.
- [ ] Old domain every public path 301 to the new path; `/demo/` 410.
- [ ] Admin login and session refresh on the new domain.
- [ ] API health, camera/widget/group APIs and image URLs.
- [ ] Widget on a test host page, including share URL/hash state.
- [ ] Embed snippets for camera and group use the new domain.
- [ ] OG/Twitter previews, canonical, sitemap, robots.
- [ ] Stripe webhook test, checkout and portal.
- [ ] Cloudflare cache status and `/embed.js` freshness.
- [ ] No mixed old-domain URLs in HTML/JS/assets.
- [ ] `npm run typecheck && npm test && npm run lint && npm run build && npm run design:check`.

## 12. Rollback

- Keep the old deployment, DNS records and environment available for at least 30 days.
- If cutover fails: revert DNS/Cloudflare to the old origin, restore `PUBLIC_BASE_URL` and old URLs, rebuild/restart API/web, and re-run smoke tests.
- Do not delete the old domain or its redirects; the redirect is part of the SEO migration.

## 13. Post-cutover (12 months)

- Monitor old-domain 301s, 404s and Search Console errors weekly, then monthly.
- Update any remaining external profiles/backlinks as they are found.
- Keep the old domain registration, redirect and Search Console property.
