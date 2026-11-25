# Camera History — plán k 90 % do 31. 1. 2027

> **Archiv / import source.** The private Trello board `Camera History — 90 % do 31. 1. 2027` is the single source of truth for task status. This file is kept only as the original import source and may drift.

**Stav:** archivní návrh, 17. 11. 2026
**Cíl:** do 31. 1. 2027 mít produkt, trust vrstvu a pilotní onboarding na úrovni, kdy lze přijmout první platící kamerové operátory.
**Nejedná se o slib 20 platících zákazníků.** 90 % znamená hlavně dokončené launch gates a rozjetý pilot.

## 1. Co znamená 90 %

Do 31. 1. 2027 musí být hotové všechny P0 položky:

- finální doména `camera-history.com`, stará doména 301;
- právní dokumenty a privacy vrstva po review;
- retention deletion, mazání objektů a DSAR/erasure drill;
- zálohy, restore test, monitoring a incidentní postup;
- Stripe live mode ověřený včetně webhooku, portálu a daní;
- NSFW report-only flow;
- cache headers, purge a load testy;
- 10–20 design partnerů v pipeline, alespoň 10 v onboardingu;
- launch checklist bez otevřených P0/P1 blokátorů.

Zbylých 10 % může být obsah, case studies, další jazyky, automatizovaná moderace a rozšiřování trhů.

## 2. Trello board

**Název:** `Camera History — 90 % do 31. 1. 2027`

### Listy

| List | Význam |
|---|---|
| `Done` | hotové věci, stručně |
| `Now` | 17. 11. – 7. 12. 2026 |
| `Next` | 8. 12. 2026 – 4. 1. 2027 |
| `Later` | 5. – 31. 1. 2027 |
| `Blocked / waiting` | čeká na klíč, právníka, dodavatele, rozhodnutí |

### Labely

- **Typ práce:** `Simple`, `Deep work`, `Boring`
- **Oblast:** `Product`, `Infra`, `Legal`, `Billing`, `GTM`, `Brand`
- **Priorita:** `P0`

### Konvence

- Každá karta má checklist podúkolů, due date a jednoznačné acceptance kritérium.
- Hotová karta se přesune do `Done`; checklist se odškrtne.
- Blokovaná karta jde do `Blocked / waiting` s důvodem v komentáři.
- Každý pátek krátká revize: co je hotové, co je blokované, co se posouvá.

## 3. Hotovo — stručně

| ID | Hotovo |
|---|---|
| DONE-01 | Core SaaS: admin, kamery, skupiny, drag ordering, témata, retention plány, 12/24h formát. |
| DONE-02 | Stripe sandbox: 7 cen, Managed Payments, daň, customer údaje, 7denní grace, auto-cancel/resume, gating, item sync. |
| DONE-03 | Brand A2: logotypy, favicony, OG, brand stránka, design systém a `design:check`. |
| DONE-04 | Landing a deck redesign, live deploy, odstranění demo routes. |
| DONE-05 | Nginx/Cloudflare cache bypass pro mutable obsah a úspěšný cache purge. |
| DONE-06 | Roadmapa, launch checklist, infrastruktura, privacy/content-safety plán. |
| DONE-07 | Úklid testovacích Stripe dat a obnovení free slotů na 20/20. |
| DONE-08 | Landing page redesign, mobilní menu, CTA a reálný demo archive; nasazeno z working tree. |

## 4. Kategorie práce

### 4.1 Jednoduché — lze dělat cestou, ve frontě, mezi schůzkami

- koupit/ověřit doménu, Cloudflare přístupy, e-mail;
- zřídit Trello, kalendář, připomínky;
- získat API klíče, tokeny a přístupy;
- připravit lead databázi a outreach šablony;
- objednat právní review;
- nastavit Search Console, Stripe profil, status page;
- aktualizovat texty, screenshoty a dokumentaci;
- odškrtávat hotové podúkoly.

### 4.2 Náročné — potřebuje klid a blok času

- doménová migrace a nginx;
- retention deletion a mazání objektů;
- zálohy, PITR, offsite replication a restore test;
- Stripe live mode a billing edge cases;
- NSFW report-only flow;
- cache headers a load testy;
- bezpečnostní hardening a monitoring;
- DSAR/erasure drill;
- finální launch gate.

### 4.3 Nutné, ale nudné

- právní dokumenty, DPA, ROPA, subprocessoři;
- cookies, privacy notice, company údaje;
- daně, faktury, refundace, účtování;
- logy, retence logů, incidentní kontakty;
- zálohy a jejich kontrola;
- DNS, certifikáty, Search Console;
- dokumentace, board hygiene, testovací data.

## 5. Časový plán

| Týden | Termín | Fokus | Exit kritérium |
|---|---|---|---|
| 0 | 17.–23. 11. | rozhodnutí, přístupy, board, právník, Stripe live start | známý vlastník domény, právní review objednán, backup provider vybrán |
| 1 | 24.–30. 11. | doména, DNS, TLS, nginx, e-mail, test Stripe URL | nová doména 200, stará 301, e-mail funguje |
| 2 | 1.–7. 12. | legal/privacy v1, retention deletion, NSFW report | právní texty v review, retence a report flow otestované |
| 3 | 8.–14. 12. | zálohy, DR, monitoring, security hardening | restore test prošel, alerty běží, P0 security zavřené |
| 4 | 15.–21. 12. | Stripe live, pilot onboarding, WP plugin | live checkout a webhook prošly, onboarding krok za krokem |
| 5 | 22.–28. 12. | lehčí týden: leady, outreach, case study šablona | 200–500 leadů, 3–5 follow-upů připraveno |
| 6 | 29. 12.–4. 1. | cache, load testy, performance, a11y/SEO | 20/100 kamer projde, cache hit a purge ověřené |
| 7 | 5.–11. 1. | pilot outreach a první onboardinky | 10–20 oslovených, 5 v onboardingu, první feedback |
| 8 | 12.–18. 1. | compliance drily, billing smoke, QA | DSAR/erasure/NSFW drill prošel, live Stripe znovu ověřen |
| 9 | 19.–25. 1. | launch gate | všechny P0 hotové, 10–20 partnerů v pipeline |
| 10 | 26.–31. 1. | buffer a 90% review | P0/P1 zavřené, board 90 %, plán na únor |

## 6. Karty a podúkoly

### Now — 17. 11. – 7. 12.

#### SETUP-01 — Založit Trello board a importovat plán
- **Typ:** Simple
- **Oblast:** Product
- **Termín:** 18. 11. 2026
- **Checklist:**
  - [ ] získat Trello API key + token
  - [ ] vytvořit board, listy a labely
  - [ ] vytvořit karty a checklists
  - [ ] přesunout hotové karty do `Done`
  - [ ] pozvat uživatele a ověřit přístup

#### DEC-01 — Ověřit doménu a přístupy
- **Typ:** Simple
- **Oblast:** Infra
- **Termín:** 20. 11. 2026
- **Checklist:**
  - [ ] vlastnictví `camera-history.com` a registrar přístup
  - [ ] Cloudflare účet/zone přístup
  - [ ] DNS a e-mailové přístupy
  - [ ] rozhodnout `hello@` a osobní outreach mailbox
  - [ ] zapsat vlastníky a recovery kódy

#### DEC-02 — Zamknout rozsah a launch market
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 23. 11. 2026
- **Checklist:**
  - [ ] sepsat, co je P0 a co je až později
  - [ ] rozhodnout launch market a jazyk první verze
  - [ ] potvrdit právní entitu a fakturační údaje
  - [ ] potvrdit, že první pilot jede bez SLA
  - [ ] uložit rozhodnutí do `docs/`

#### DEC-03 — Vybrat backup, monitoring a support tooly
- **Typ:** Simple
- **Oblast:** Infra
- **Termín:** 23. 11. 2026
- **Checklist:**
  - [ ] vybrat offsite storage pro Postgres a MinIO
  - [ ] vybrat uptime/error monitoring
  - [ ] vybrat status page a support inbox
  - [ ] ověřit ceny a limity
  - [ ] vytvořit účty a uložit credentials mimo repo

#### DEC-04 — Rozjet Stripe live
- **Typ:** Simple
- **Oblast:** Billing
- **Termín:** 23. 11. 2026
- **Checklist:**
  - [ ] dokončit business verification
  - [ ] ověřit bankovní účet a payout
  - [ ] potvrdit daňovou registraci a Stripe Tax
  - [ ] zkontrolovat, že ceny jsou tax-inclusive
  - [ ] naplánovat live smoke až po právním review

#### AUDIT-01 — Inventura staré domény, secrets a deploye
- **Typ:** Boring
- **Oblast:** Infra
- **Termín:** 23. 11. 2026
- **Checklist:**
  - [ ] `grep` všech výskytů `camera.sengycraft.cz`
  - [ ] seznam míst: env, nginx, embed, WP plugin, testy, docs, Stripe
  - [ ] záloha `.env`, nginx, Cloudflare, Stripe a DNS
  - [ ] ověřit, že existuje aktuální DB/objektová záloha
  - [ ] připravit rollback body

#### DOMAIN-01 — DNS, TLS a nový Cloudflare origin
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 26. 11. 2026
- **Závisí na:** DEC-01
- **Checklist:**
  - [ ] vytvořit zone `camera-history.com`
  - [ ] apex + `www` DNS
  - [ ] origin certificate a instalace
  - [ ] Cloudflare cache pravidla
  - [ ] `www` 301 na apex

#### DOMAIN-02 — Nginx pro novou a starou doménu
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 27. 11. 2026
- **Checklist:**
  - [ ] nový server block `camera-history.com`
  - [ ] starý server block 301 path-preserving
  - [ ] `/admin/`, `/widget/`, `/group/`, `/deck/`, `/deck.pdf` noindex
  - [ ] `/demo/` 410
  - [ ] `nginx -t` a reload
  - [ ] rollback config připraven

#### DOMAIN-03 — Přepsat odkazy a konfiguraci
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 28. 11. 2026
- **Checklist:**
  - [ ] `PUBLIC_BASE_URL` a `.env.example`
  - [ ] `embed.js` ORIGIN
  - [ ] canonical, OG, Twitter, JSON-LD, sitemap, robots
  - [ ] testy a WordPress plugin defaulty
  - [ ] README, skripty, screenshoty, deck
  - [ ] Stripe webhook a return URL v test mode
  - [ ] grep nesmí najít starou doménu

#### DOMAIN-04 — E-mail a doručitelnost
- **Typ:** Boring
- **Oblast:** Ops
- **Termín:** 28. 11. 2026
- **Checklist:**
  - [ ] `support@camera-history.com` / `marek@camera-history.com` / `privacy@camera-history.com` / `noreply@camera-history.com`
  - [ ] osobní outreach adresa
  - [ ] SPF, DKIM, DMARC
  - [ ] forward ze staré adresy
  - [ ] podpis a šablony

#### DOMAIN-05 — Search Console a cutover QA
- **Typ:** Simple
- **Oblast:** GTM
- **Termín:** 30. 11. 2026
- **Checklist:**
  - [ ] nová property a sitemap
  - [ ] Change of Address ze staré property
  - [ ] stará property zůstává
  - [ ] 301 test všech veřejných cest
  - [ ] admin login, API, widget, group, share
  - [ ] OG/Twitter náhledy
  - [ ] smoke a rollback check

#### LEGAL-01 — Právní dokumenty v1
- **Typ:** Deep work + Boring
- **Oblast:** Legal
- **Termín:** 4. 12. 2026
- **Checklist:**
  - [ ] terms of service
  - [ ] privacy policy
  - [ ] cookie policy
  - [ ] DPA pro operátory
  - [ ] acceptable-use policy
  - [ ] refund/cancellation a cooling-off
  - [ ] subprocessor list
  - [ ] company/operator údaje
  - [ ] odeslat právníkovi

#### LEGAL-02 — Publikovat právní vrstvu
- **Typ:** Deep work
- **Oblast:** Legal
- **Termín:** 7. 12. 2026
- **Checklist:**
  - [ ] stránky terms/privacy/cookies/DPA/AUP
  - [ ] odkazy ve footeru
  - [ ] privacy notice link ve widgetu/group
  - [ ] cookie consent jen pro non-essential
  - [ ] stránky bez indexace, pokud nemají být veřejné
  - [ ] odkazy v adminu a e-mailu

#### PRIV-01 — ROPA, DPIA, DSAR a incident runbook
- **Typ:** Boring + Deep work
- **Oblast:** Legal
- **Termín:** 7. 12. 2026
- **Checklist:**
  - [ ] data map/ROPA
  - [ ] lawful basis a role model
  - [ ] DPIA template pro operátory
  - [ ] DSAR workflow a identities
  - [ ] breach/incident runbook
  - [ ] log retention a IP minimisation

#### PRIV-02 — Retention deletion a mazání objektů
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 7. 12. 2026
- **Checklist:**
  - [ ] job maže staré DB řádky
  - [ ] maže MinIO objekty a verze
  - [ ] purge CDN
  - [ ] tenant/camera delete maže objekty
  - [ ] test na kameře s cache
  - [ ] test erasure bez zbylých kamer
  - [ ] dokumentovat backup expiry

#### SAFE-01 — NSFW report-only flow
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 7. 12. 2026
- **Checklist:**
  - [ ] report akce ve widgetu/group
  - [ ] rate limit a volitelný kontakt
  - [ ] admin moderation queue
  - [ ] okamžité skrytí při credible reportu
  - [ ] review: restore / hide / block / delete / escalate
  - [ ] notifikace operátora
  - [ ] audit log a appeal
  - [ ] CSAM/illegal escalation runbook

#### DOMAIN-06 — Cutover a první produkční smoke
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 30. 11. 2026
- **Checklist:**
  - [ ] DNS cutover
  - [ ] nová doména 200
  - [ ] stará doména 301
  - [ ] API health a image URL
  - [ ] widget na test host page
  - [ ] žádné mixed URL
  - [ ] rollback ready 30 dní

### Next — 8. 12. 2026 – 4. 1. 2027

#### OPS-01 — Zálohy a DR
- **Typ:** Deep work + Boring
- **Oblast:** Infra
- **Termín:** 11. 12. 2026
- **Checklist:**
  - [ ] Postgres daily full + WAL/PITR
  - [ ] MinIO offsite replication
  - [ ] verzování/object lock a checksums
  - [ ] záloha `.env`, nginx, Cloudflare, Stripe, DNS
  - [ ] restore test
  - [ ] alert na failed backup
  - [ ] RPO/RTO dokumentace

#### OPS-02 — Monitoring, status page, support
- **Typ:** Deep work
- **Oblast:** Ops
- **Termín:** 14. 12. 2026
- **Checklist:**
  - [ ] uptime API/web/DB/MinIO
  - [ ] error tracking
  - [ ] disk, CPU, DB rows, capture lag
  - [ ] alert routing
  - [ ] status page
  - [ ] support inbox a response times
  - [ ] incident process

#### SEC-01 — Security hardening
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 14. 12. 2026
- **Checklist:**
  - [ ] CSP, HSTS, referrer, frame ancestors
  - [ ] rate limits
  - [ ] secrets a rotace
  - [ ] admin least privilege a audit
  - [ ] dependency scan
  - [ ] cookies a session
  - [ ] security headers test

#### OPS-03 — Pilot host guardrails
- **Typ:** Boring
- **Oblast:** Infra
- **Termín:** 14. 12. 2026
- **Checklist:**
  - [ ] resource limits
  - [ ] disk watermark alert
  - [ ] ffmpeg a Docker log rotation
  - [ ] inode monitoring
  - [ ] no destructive cleanup
  - [ ] zápis known limitations

#### BILL-01 — Stripe live mode
- **Typ:** Deep work
- **Oblast:** Billing
- **Termín:** 18. 12. 2026
- **Checklist:**
  - [ ] live produkt a ceny
  - [ ] tax code a Managed Payments
  - [ ] webhook live endpoint
  - [ ] portal a return URL
  - [ ] checkout success/cancel
  - [ ] test live checkout a webhook
  - [ ] invoice a receipt
  - [ ] refund a cancel

#### BILL-02 — Billing edge cases
- **Typ:** Deep work
- **Oblast:** Billing
- **Termín:** 21. 12. 2026
- **Checklist:**
  - [ ] dunning a grace
  - [ ] cancel/resume
  - [ ] poslední kamera
  - [ ] změna ti eru
  - [ ] free month sloty
  - [ ] tax inclusive kontrola
  - [ ] unit economics

#### ONB-01 — Pilot onboarding
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 21. 12. 2026
- **Checklist:**
  - [ ] add camera krok za krokem
  - [ ] embed snippet
  - [ ] group a share
  - [ ] WP plugin
  - [ ] support kontakt
  - [ ] test se 3 demo kamerami
  - [ ] onboarding checklist pro operátora

#### ONB-02 — Admin first-run a help
- **Typ:** Simple
- **Oblast:** Product
- **Termín:** 21. 12. 2026
- **Checklist:**
  - [ ] empty states
  - [ ] první kamera
  - [ ] billing vysvětlení
  - [ ] FAQ
  - [ ] kontakt na support

#### GTM-01 — Lead databáze 200–500
- **Typ:** Simple
- **Oblast:** GTM
- **Termín:** 28. 12. 2026
- **Checklist:**
  - [ ] ski resorts
  - [ ] marinas a kite spots
  - [ ] attractions a landmarks
  - [ ] construction cams
  - [ ] weather/nature streams
  - [ ] kontakt, země, typ, poznámka
  - [ ] opt-out pole

#### GTM-02 — Outreach sekvence
- **Typ:** Simple
- **Oblast:** GTM
- **Termín:** 28. 12. 2026
- **Checklist:**
  - [ ] specifická observace ke kameře
  - [ ] one-sentence pitch
  - [ ] demo link
  - [ ] 3–5 follow-upů
  - [ ] CRM a tracking
  - [ ] žádné paid ads ani launch sites

#### CONTENT-01 — Sales obsah
- **Typ:** Simple
- **Oblast:** Brand
- **Termín:** 28. 12. 2026
- **Checklist:**
  - [ ] case study template
  - [ ] deck refresh
  - [ ] screenshoty a demo video
  - [ ] pricing FAQ
  - [ ] pilot one-pager

#### PERF-01 — Cache headers a CF pravidla
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 2. 1. 2027
- **Checklist:**
  - [ ] image TTL 1 h + purge
  - [ ] current-day JSON 60 s
  - [ ] historical JSON 24 h
  - [ ] metadata 5 min
  - [ ] group 1 min
  - [ ] admin/404 `no-store`
  - [ ] purge test při delete/NSFW

#### PERF-02 — Load testy
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 4. 1. 2027
- **Checklist:**
  - [ ] 20 kamer / 60 min
  - [ ] 100 kamer
  - [ ] 500 kamer
  - [ ] 1 000 kamer
  - [ ] capture lag, CPU, RAM, DB, disk
  - [ ] cache hit ratio
  - [ ] rozhodnutí o hostingu

#### QA-01 — Lighthouse, CWV, a11y, SEO
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 4. 1. 2027
- **Checklist:**
  - [ ] landing mobile + desktop
  - [ ] widget
  - [ ] admin
  - [ ] LCP/INP/CLS
  - [ ] focus a contrast
  - [ ] canonical/sitemap/robots
  - [ ] opravit P0/P1

#### QA-02 — WP plugin a embed smoke
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 4. 1. 2027
- **Checklist:**
  - [ ] reálná WP instalace
  - [ ] API URL a login
  - [ ] shortcode
  - [ ] theme parametr
  - [ ] share hash
  - [ ] group embed
  - [ ] starý demo 410

### Later — 5. – 31. 1. 2027

#### PILOT-01 — Oslovit 10–20 design partnerů
- **Typ:** Simple
- **Oblast:** GTM
- **Termín:** 11. 1. 2027
- **Checklist:**
  - [ ] 10–20 cílených účtů
  - [ ] personalizované zprávy
  - [ ] follow-upy
  - [ ] demo termíny
  - [ ] CRM stav
  - [ ] žádný spam

#### PILOT-02 — Onboardovat prvních 5
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 11. 1. 2027
- **Checklist:**
  - [ ] kamera
  - [ ] retention
  - [ ] embed
  - [ ] group
  - [ ] billing
  - [ ] feedback
  - [ ] activation blockers

#### PILOT-03 — První case study a metriky
- **Typ:** Simple
- **Oblast:** GTM
- **Termín:** 11. 1. 2027
- **Checklist:**
  - [ ] 1 case study draft
  - [ ] testimonial
  - [ ] aktivace
  - [ ] první conversion
  - [ ] metriky do boardu

#### PRIV-03 — Compliance drily
- **Typ:** Boring + Deep work
- **Oblast:** Legal
- **Termín:** 15. 1. 2027
- **Checklist:**
  - [ ] DSAR access/export
  - [ ] erasure
  - [ ] retention job
  - [ ] CDN purge
  - [ ] backup expiry
  - [ ] NSFW queue
  - [ ] breach tabletop

#### BILL-03 — Live billing smoke
- **Typ:** Deep work
- **Oblast:** Billing
- **Termín:** 15. 1. 2027
- **Checklist:**
  - [ ] checkout
  - [ ] webhook
  - [ ] portal
  - [ ] daň
  - [ ] faktura
  - [ ] refund
  - [ ] cancel/resume

#### QA-03 — Domain a SEO finální QA
- **Typ:** Boring + Deep work
- **Oblast:** GTM
- **Termín:** 18. 1. 2027
- **Checklist:**
  - [ ] žádné staré URL
  - [ ] 301 všechny cesty
  - [ ] sitemap
  - [ ] Search Console
  - [ ] OG preview
  - [ ] CWV
  - [ ] 404 monitoring

#### OPS-04 — Druhý restore test a alerty
- **Typ:** Boring
- **Oblast:** Infra
- **Termín:** 18. 1. 2027
- **Checklist:**
  - [ ] Postgres restore
  - [ ] MinIO restore
  - [ ] ověřit RPO/RTO
  - [ ] alerty
  - [ ] disk forecast
  - [ ] zápis výsledku

#### GATE-01 — Launch checklist
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 22. 1. 2027
- **Checklist:**
  - [ ] legal
  - [ ] privacy
  - [ ] backups
  - [ ] billing
  - [ ] cache
  - [ ] security
  - [ ] support
  - [ ] P0 bez blokátorů

#### GATE-02 — Smlouvy a pilot pipeline
- **Typ:** Deep work + Simple
- **Oblast:** GTM
- **Termín:** 25. 1. 2027
- **Checklist:**
  - [ ] DPA akceptované online
  - [ ] informační stránka pilotu
  - [ ] 10–20 partnerů
  - [ ] 10 v onboardingu
  - [ ] první platící
  - [ ] CRM čisté

#### GATE-03 — Go/no-go
- **Typ:** Deep work
- **Oblast:** Product
- **Termín:** 25. 1. 2027
- **Checklist:**
  - [ ] P0/P1 review
  - [ ] známé mezery
  - [ ] rollback
  - [ ] support ready
  - [ ] decision log

#### GATE-04 — Finální deploy a smoke
- **Typ:** Deep work
- **Oblast:** Infra
- **Termín:** 25. 1. 2027
- **Checklist:**
  - [ ] deploy site/admin/web
  - [ ] restart API/worker
  - [ ] health
  - [ ] widget
  - [ ] billing
  - [ ] monitoring
  - [ ] status page

#### REVIEW-01 — 90% review
- **Typ:** Boring
- **Oblast:** Product
- **Termín:** 31. 1. 2027
- **Checklist:**
  - [ ] board completion
  - [ ] launch checklist
  - [ ] otevřené P0/P1
  - [ ] metriky
  - [ ] known gaps
  - [ ] plán na únor

## 7. Kritická cesta

1. **Přístupy a rozhodnutí** (doména, právník, backup, Stripe live) — bez toho se zpozdí vše.
2. **Doména + právní texty + zálohy** — gate před outreachem.
3. **Retention deletion + NSFW + Stripe live** — gate před prvním platícím zákazníkem.
4. **Cache + load testy + monitoring** — gate před pilotem na současném hostu.
5. **Pilot outreach** — začít až po zelené na doméně, právech a zálohách.
6. **Launch gate** — 19.–25. 1.; poslední týden je buffer.

## 8. Rizika a reakce

| Riziko | Dopad | Reakce |
|---|---|---|
| Doména není dostupná nebo není přístup | blokuje migraci i GTM | řešit hned v DEC-01; alternativní doména až po rozhodnutí |
| Právní review se zpozdí | blokuje piloty | objednat hned, použít drafty a review po částech |
| Stripe live verification se zpozdí | nejde přijímat platby | začít hned, testovat sandbox paralelně |
| Backup provider není hotový | nelze pustit piloty | použít dočasné offsite úložiště s ověřeným restore |
| Load testy odhalí problém | odklad launch gate | 20/100 kamer jako minimum pro pilot, 500/1000 až později |
| 20 partnerů se nestihne | 90 % cíl ohrožen | cíl je 10–20 v pipeline; 10 v onboardingu je minimum |

## 9. Trello

Board je založený a naplněný. Od 17. 11. 2026 je jediným zdrojem pravdy pro stavy úkolů; tento dokument slouží pouze jako archiv importu.
