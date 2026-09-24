# M6 — Produkční nasazení (docker compose + runbook)

> Status: schváleno uživatelem (2026-09-24)
> Navazuje na: hlavní design doc `docs/superpowers/specs/2026-09-18-camera-history-saas-design.md` (§3 Nasazení a síť, §15 milníky)

## 1. Rozhodnutí (z brainstormingového dialogu)

- **Rozsah:** připravit v repu + lokálně ověřit. Skutečné VPS kroky (SSH, certbot, Cloudflare, nginx site) zůstanou jako runbook v README, protože vyžadují credentials.
- **Admin dashboard:** servírován z `web` kontejneru pod `/admin/` (jedna publikovaná adresa, soulad se spec topologií).
- **DB migrace:** běží při startu `api` kontejneru (idempotentní drizzle migrator; api image kopíruje `packages/db/drizzle`).
- **Porty postgres/minio** zůstávají publikované jen na `127.0.0.1` (hostitel) — není internetová expozice, ponechává funkční dev scripty i lokální smoke. (Mírná odchylka od spec §3 „žádný port"; zdokumentováno.)
- **Mimo rozsah:** skutečný deploy na VPS, CI pipline, swap dat, autoupgrade.

## 2. Topologie

| Service | Image | Porty | Poznámka |
|---|---|---|---|
| postgres | `postgres:16-alpine` | 127.0.0.1:5432 | beze změny |
| minio | `quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z` | 127.0.0.1:9000, 9001 | beze změny |
| api | build `packages/api/Dockerfile` | 127.0.0.1:3000 | migrate@startup + server |
| worker | build `packages/worker/Dockerfile` | — | žádný port |
| web | build `packages/web/Dockerfile` | 127.0.0.1:8080 | nginx: `/` widget, `/admin/` admin |

Síť: vše v jedné compose síti; `api` a `worker` se připojí na `postgres` a `minio` přes **hostname servisy**, `DATABASE_URL`/`MINIO_ENDPOINT` proto ukazují na `postgres`/`minio` (ne `127.0.0.1`).

## 3. Změny v repu

### 3.1 `docker-compose.yml`
- Přidat servisy `api`, `worker`, `web` s `build` z `packages/*/Dockerfile`.
- `api`: `depends_on` postgres+minio **healthy**, env z `.env`, image publikuje 3000 (mapping v compose: `127.0.0.1:3000:3000`), healthcheck `wget -qO- http://127.0.0.1:3000/api/v1/health`.
- `worker`: `depends_on` postgres healthy; env z `.env`; žádné porty.
- `web`: porty `127.0.0.1:8080:80` (nginx uvnitř naslouchá na 80, EXPOSE jen metadata).
- Společná část env (api+worker): `DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`, `MINIO_ENDPOINT=minio`, `MINIO_PORT=9000`, `MINIO_USE_SSL=false`, plus JWT/API/Workere/feed/plan/stripe/billing z `.env`.
- `restart: unless-stopped` na api/workere/web.

### 3.2 `packages/api/Dockerfile`
- Build stage beze změny (core+db+api).
- Runtime stage navíc zkopíruje:
  - `packages/db/drizzle` → `/app/packages/db/drizzle` (migrační SQL),
  - `packages/db/dist/migrate.js` (je obsaženo v `packages/db/dist`).
- `CMD`: `node packages/db/dist/migrate.js && node packages/api/dist/server.js`.

### 3.3 `packages/web/Dockerfile` + nginx.conf
- Build `@ch/web` i `@ch/admin`; do nginx image zkopírovat `packages/web/dist` → `/usr/share/nginx/html` a `packages/admin/dist` → `/usr/share/nginx/html/admin`.
- Vlastní `nginx.conf` (nahrazuje default):
  - `location /widget/` → `try_files $uri /index.html` (SPA fallback),
  - `location /admin/` → alias na `/usr/share/nginx/html/admin`, `try_files $uri /admin/index.html`,
  - jinak statický widget dist.
  - Nebezpečí `/api/` v web kontejneru neproxy — API řeší hostitelský nginx na úrovni domény.

### 3.4 README — sekce M6
- Build/start: `docker compose build`, `docker compose up -d`.
- Produkční `.env` klíčové hodnoty (tabulka): `DATABASE_URL`/`MINIO_ENDPOINT` hostname servis, `PUBLIC_BASE_URL=https://camera.sengycraft.cz`, `JWT_SECRET` (dlouhý náhodný), `MINIO_ACCESS_KEY/SECRET_KEY` silné, `STRIPE_*` dle M4.
- Runbook VPS (kroky zůstávají na uživateli, vyžadují creds):
  1. clone repa na VPS, `.env`, `docker compose up -d`.
  2. Hostitelský nginx site `camera.sengycraft.cz`, `listen 20005 ssl http2`, `location /widget/` → 127.0.0.1:8080, `location /api/` → 127.0.0.1:3000, `location /admin/` → 127.0.0.1:8080.
  3. certbot DNS-01 (Cloudflare plugin) — vzor ze spec §3.
  4. Cloudflare A record + Origin Rule na port 20005.

## 4. Verifikace (lokální smoke, v repu)

1. `docker compose build` — všechny image.
2. `docker compose up -d` — servisy healthy.
3. `GET http://127.0.0.1:3000/api/v1/health` → 200.
4. Seed: `python3 -m http.server 8000` s testovacím JPEG; API register tenant, login, create camera `static_url` na `http://172.17.0.1:8000/test.jpg` (docker bridge gateway hostitele).
5. Worker: počkat ~6 min (interval 5 min, tick 60 s), ověřit log capture a `GET /api/v1/cameras/:id/images?date=YYYY-MM-DD` → ≥1 snímek.
6. Widget: `GET http://127.0.0.1:8080/widget/{slug}/{id}` vrací HTML, JS assets 200.
7. Admin: `GET http://127.0.0.1:8080/admin/` vrací HTML.
8. Gate: `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build` PASS; `git status` čisté.

## 5. Definition of Done

- Compose startuje všech 5 servis, migrace běží automaticky, widget+admin fungují pod `web` kontejnerem.
- Worker uloží snímek z static feedu end-to-end (worker → MinIO → API → widget data).
- README sekce M6 včetně VPS runbooku.
- Gaty výše PASS; žádné nové deps; 6 workspace balíčků bez nedeklarovaných změn.