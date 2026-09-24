# Camera History — SaaS

Multi-tenant SaaS pro resorty a skiareály: periodické snímkování venkovních kamer + veřejná embedovatelná historie.

- Monorepo: `packages/{core,db,worker,api,web}` (design doc: `docs/superpowers/specs/2026-09-18-camera-history-saas-design.md`)
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
