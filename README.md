# Camera History — SaaS

Multi-tenant SaaS pro resorty a skiareály: periodické snímkování venkovních kamer + veřejná embedovatelná historie.

- Monorepo: `packages/{core,db,worker,api,web}` (design doc: `docs/superpowers/specs/2026-09-18-camera-history-saas-design.md`)
- UI design system: `docs/design-system.md` (`@ch/design` tokens, Montserrat, `npm run design:check`)
- Stack: TypeScript, Node (Fastify), Postgres (drizzle), MinIO, React (Vite)
- Legacy kód z původní single-camera verze: `legacy/`

## Dev setup

1. `npm install`
2. `docker compose up -d postgres minio` (Postgres :5432, MinIO :9000/API a :9001/console, jen na 127.0.0.1)
3. `npm run db:migrate` (vyžaduje běžící Postgres; nastavení přes `.env` → `.env.example`)
4. `npm run dev:api` (port 3000) a `npm run dev:web` (port 8080, proxy `/api` → API), každý v samostatném terminálu
5. `npm run dev:worker` (capture snímků)

## Checks

```bash
npm run typecheck   # tsc ve všech balíčcích
npm run test        # vitest (core/db/worker/api/web)
npm run lint        # eslint
npm run build       # dist pro core/db/api/worker/web
npm run design:check # design systém: tokeny, fonty, barvy
npm run e2e --workspace @ch/web   # Playwright widget smoke (API mockováno)
```

Integrační testy proti reálnému Postgres se spustí přes `RUN_INTEGRATION=1 npm run test --workspace @ch/api` (jinak jsou přeskočené).

## Embed widgetu

Pokud API a web běží na stejném origin (např. `camera.sengycraft.cz`), vloží se widget jako iframe:

```html
<iframe
  src="https://camera.sengycraft.cz/widget/{tenant_slug}/{camera_id}"
  style="width:100%;height:600px;border:0;"
  frameborder="0" allowfullscreen></iframe>
```

Odkaz na konkrétní hodinu lze sestavit přes query parametry `?date=YYYY-MM-DD&hour=HH`.

## M2 — Admin dashboard a feed types

### Admin dashboard

- V deploy verzi admin dashboard běží na `/admin/` (nginx `location /admin/` → `packages/admin/dist/`).
- Lokálně se spustí `npm run dev:admin` na portu **8081** (vite dev server s `base: "/admin/"`, proxy `/api` → API na `127.0.0.1:3000`).

Přihlášení probíhá přes admin endpoints (`/api/v1/admin/...`), JWT access/refresh tokeny se ukládají do httpOnly cookies (`ch_access`, `ch_refresh`).

### Feed types

Podporované feed types (`cameras.feed_type`) a povinné schéma URL (`cameras.feed_url`):

| feed_type | povinné schéma feed_url |
|---|---|
| `static_url` | `http://` nebo `https://` |
| `mjpeg` | `http://` nebo `https://` |
| `hls` | `http://` nebo `https://` |
| `rtsp` | `rtsp://` |
| `custom` | `wss://` |

Adaptéry pro `hls` a `rtsp` dekódují stream přes nástroj `ffmpeg` (jehož binárka se volá ze sledovacího procesu). Na serveru proto musí být nainstalovaný:

```bash
sudo apt-get install -y ffmpeg
```

### `cameras.status`

| hodnota | význam |
|---|---|
| `operational` | poslední snímek se podařilo zachytit a uložit (výchozí hodnota) |
| `delayed` | poslední pokus o snímek selhal (po jednom retry s backoffem); do `lastError` se zapíše chyba |
| `offline` | selhání dvou po sobě jdoucích pokusů (kamera už byla `delayed` a selhala znovu) |

## M3 — WordPress plugin

Thin WP plugin, který embeduje widget jako iframe přes shortcode. Zdroj: `packages/wp-plugin/camera-history/`
(čisté PHP, žádný Composer). Není součástí npm workspace.

### Build distribučního ZIP

```bash
node scripts/zip-wp-plugin.mjs   # → packages/wp-plugin/dist/camera-history.zip
```

### Instalace a konfigurace (manuální smoke, mimo repo)

1. Nahrajte `packages/wp-plugin/dist/camera-history.zip` přes **Plugins → Add New → Upload Plugin** a aktivujte.
2. **Settings → Camera History**: vyplňte API URL (např. `https://camera.sengycraft.cz`), e-mail a heslo
   do SaaS admin účtu a tenant slug.
3. Vyberte kameru z dropdownu (seznam z `GET /api/v1/admin/cameras`) a zkopírujte shortcode
   `[camera-history camera="…"]`.
4. Vložte shortcode do stránky/příspěvku. Volitelné atributy: `width` (100%), `height` (600), `theme`.

### Testy pluginu

```bash
php packages/wp-plugin/test/harness.php   # stub harness clienta + shortcodu (bez PHPUnit/WP)
php -l packages/wp-plugin/camera-history/*.php packages/wp-plugin/camera-history/includes/*.php
```
## M4 — Billing (Stripe, per-camera metered)

Každá kamera má retenční plán (`plan_months`); `null` znamená „dědí výchozí plán tenanta“.
Výchozí plán se nastavuje v Billingu, per-kamera override v editoru kamery. Celková cena je
součet počtu kamer v každém tieru × cena za kameru.

Stripe model: **jedna subscription na tenanta s licensed cenami po tierech**. Každá cena má
quantity = počet kamer v daném efektivním tieru. Worker každou hodinu synchronizuje quantities
(přidá/upraví/odebere subscription item); checkout obsahuje jen tiery, které tenant aktuálně používá.
Billing stránka ukazuje odhad měsíční částky a rozpad podle plánů.

### Zapnutí sandboxu

1. `STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs` — vytvoří produkt a 7 licensed cen.
2. Do `.env` zkopíruj vypsané `STRIPE_PRICE_*` a nastav `STRIPE_ENABLED=true`.
3. Stripe → Developers → Webhooks → endpoint `https://camera.sengycraft.cz/api/v1/billing/webhook`
   s událostmi `checkout.session.completed`, `checkout.session.expired`,
   `customer.subscription.updated`, `customer.subscription.deleted`; nastav
   `STRIPE_WEBHOOK_SECRET`.
4. Restartuj API/worker. Registrace už nespouští checkout; přidej kameru a v Billingu klikni
   na **Start billing**. Platba se inicializuje pro všechny tiery; usage se reportuje hourly.
   Prvních **20** nových subscription dostane automaticky **30 dní zdarma**; při expiraci
   nezaplaceného Checkoutu se slot uvolní.

### Hard stop

`past_due` + 3 dny grace (`BILLING_GRACE_DAYS`) → worker deaktivuje kamery na `enabled=false`,
tenant přejde do `unpaid`. Reaktivace automaticky po zaplacení (webhook `active`) — kamery se znovu zapnou.

## M5 — Widget themes

Presetová témata widgetu: `light` (výchozí), `dark`, `forest`, `midnight`. Téma se nastavuje per kamera
v adminu (dropdown v editoru kamery). Embed URL `?theme=midnight` přebije téma kamery; neznámé hodnoty
spadnou na téma kamery. WP plugin shortcode `theme="dark"` už tento parametr přidává (viz M3).

## M6 — Nasazení (docker compose)

### Build a start

```bash
docker compose build
docker compose up -d
```

Servisy: `postgres` + `minio` (infra, porty jen na 127.0.0.1), `api` (127.0.0.1:3000, migrace DB při startu),
`worker` (capture, bez portu), `web` (127.0.0.1:8080 — widget `/widget/...` + admin `/admin/`).
Healthcheck API: http://127.0.0.1:3000/api/v1/health, web: http://127.0.0.1:8080/.

### Produkční .env (klíčové hodnoty)

| Proměnná | Hodnota |
|---|---|
| DATABASE_URL | hostname `postgres` (compose síť), např. `postgres://camera:heslo@postgres:5432/camera_history` |
| MINIO_ENDPOINT | `minio` |
| MINIO_ACCESS_KEY / MINIO_SECRET_KEY | silné hodnoty |
| PUBLIC_BASE_URL | `https://camera.sengycraft.cz` |
| JWT_SECRET | dlouhý náhodný řetězec |
| STRIPE_* / BILLING_GRACE_DAYS | dle sekce M4 |

### Deploy na VPS (runbook — vyžaduje credentials)

1. `git clone` repozitáře na VPS, vytvoř `.env` (viz tabulka) a spusť `docker compose up -d`.
2. Hostitelský nginx — site `camera.sengycraft.cz` (TLS na portu 20005):

   ```nginx
   server {
       listen 20005 ssl http2;
       server_name camera.sengycraft.cz;
       ssl_certificate     /etc/letsencrypt/live/camera.sengycraft.cz/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/camera.sengycraft.cz/privkey.pem;
       location /widget/ { proxy_pass http://127.0.0.1:8080; }
       location /admin/  { proxy_pass http://127.0.0.1:8080; }
       location /api/    { proxy_pass http://127.0.0.1:3000; }
   }
   ```

3. Certifikát přes certbot **DNS-01** s Cloudflare pluginem (vzor ve spec `docs/superpowers/specs/2026-09-18-camera-history-saas-design.md` §3); nevyžaduje otevřený port 80/443.
4. Cloudflare: A záznam `camera.sengycraft.cz` → IP VPS (orange cloud) + Origin Rule, který origin port přesměruje na 20005.
