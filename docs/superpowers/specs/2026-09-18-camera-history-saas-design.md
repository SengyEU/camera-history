# Camera History — SaaS Platform Design

**Datum:** 2026-09-18
**Stav:** schváleno (brainstorming), start implementace M1

## 1. Přehled

Přeměnit single-camera projekt (PHP + Create React App) na multi-tenant SaaS pro resorty, skiareály a další firmy provozující venkovní kamery. Produkty:

- **SaaS** běžící na VPS: periodické snímkování kamer + veřejná prohlížitelná historie přes embedovatelný widget.
- **WordPress plugin**: tenký klient (iframe), zdarma, slouží jako lead funnel do SaaS.

Cílový zákazník: provozovatel webu (resort/skiareál). Timeline je veřejná (bez přihlášení), správu kamer si klient dělá sám (self-service admin). Branding widgetu je neutrální.

## 2. Stack a klíčová rozhodnutí

| Oblast | Rozhodnutí | Zdůvodnění |
|---|---|---|
| Jazyk | TypeScript napříč stackem | Sdílené typy mezi API, widgetem a adminem |
| Backend | Node.js (Fastify) | Jednoduché nasazení, spawn ffmpeg pro capture |
| Frontend | Vite + React 18 | Náhrada zastaralého CRA |
| Databáze | PostgreSQL | Multi-tenancy, robustnost |
| Úložiště snímků | MinIO (S3-compatible) | Self-hosted, žádná závislost na cloudu |
| Capture | ffmpeg + vlastní adaptéry | RTSP/HLS/MJPEG/static/custom |
| Deploy | docker-compose na VPS | vedle stávajícího Pterodactylu, bez konfliktu |
| TLS / proxy | nginx jako hostitelská služba + Cloudflare | vzor api.suniket.cz, žádné nové ufw pravidla |

## 3. Nasazení a síť (ops)

VPS má Pterodactyl panel (game servery) + Cloudflare za A-recordem. UFW povoluje všechny porty z Cloudflare rozsahů (pravidla ALLOW IN bez portu).

- SaaS endpoint: **`camera.sengycraft.cz`** na portu **20005** (nginx hostitelská služba, `listen 20005 ssl http2`).
- Cloudflare: A záznam camera.sengycraft.cz → VPS IP, **orange cloud** + **Origin Rule** přesměrující origin port na 20005.
- UFW: žádná změna pravidel (Cloudflare rozsahy už povolují port 20005 na INPUT).
- Certifikát: Let's Encrypt přes **certbot DNS-01** (Cloudflare plugin), nepotřebuje otevřený 80/443.

```bash
# /etc/letsencrypt/cloudflare.ini  (chmod 600)
#   dns_cloudflare_api_token = <TOKEN  Zone:DNS:Edit>
#   dns_cloudflare_zone = sengycraft.cz
#
# certbot certonly --dns-cloudflare \
#   --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
#   -d camera.sengycraft.cz --non-interactive --agree-tos -m <email>
```

nginx site `camera.sengycraft.cz`:

```nginx
server {
    listen 20005 ssl http2;
    server_name camera.sengycraft.cz;
    ssl_certificate     /etc/letsencrypt/live/camera.sengycraft.cz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/camera.sengycraft.cz/privkey.pem;

    location /widget/ { proxy_pass http://127.0.0.1:8080; }   # React widget
    location /api/    { proxy_pass http://127.0.0.1:3000; }   # Node API
}
```

### docker-compose topologie

```
váš VPS
├── Pterodactyl (game servery) — stávající, beze změny
├── nginx host service → 20005 (TLS, směruje na interní porty)
└── docker compose (SaaS)
    ├── postgres   (interní, nepublikovaný)
    ├── minio      (interní, nepublikovaný)
    ├── api        (publikuje 127.0.0.1:3000 — jen localhost hostitele)
    ├── worker     (žádný port, outbound na kamery)
    └── web        (publikuje 127.0.0.1:8080 — jen localhost hostitele)
```

- `api` a `web` publikují porty **jen na 127.0.0.1** hostitele, aby na ně dosáhl hostitelský nginx; zvenku nedostupné.
- `postgres` a `minio` nepublikují žádný port — dosažitelné jen v rámci compose sítě.
- Citlivé hodnoty v `.env`, nikdy do gitu (`.env` v .gitignore).

## 4. Architektura monorepa

```
packages/
  core/        sdílené typy, validace, konfigurace
  api/         REST JSON API (Fastify), tenancy + retenční brána
  worker/      capture service: scheduler + adaptéry kamer (ffmpeg)
  web/         veřejný widget  /widget/:tenant/:camera  (Vite + React)
  admin/       tenant admin dashboard (Vite + React)
  wp-plugin/   PHP thin client (mimo monorepo, samostatný balíček)
```

## 5. Datový model (PostgreSQL)

**tenants**
- id uuid PK
- name text
- slug text UNIQUE (URL identifikátor)
- plan_months int (retence — např. 12 default)
- created_at, updated_at

**users**
- id uuid PK
- tenant_id FK → tenants
- email text UNIQUE
- password_hash text (argon2id)
- role enum (owner | admin)
- created_at

**cameras**
- id uuid PK
- tenant_id FK → tenants
- name text
- feed_type enum (static_url | mjpeg | hls | rtsp | custom)
- feed_url text
- feed_config jsonb (parametry adaptéru)
- interval_minutes int (5|15|30|60)
- active_from time (aktivní okno start)
- active_to time (aktivní okno konec)
- timezone text
- enabled bool
- theme text (preset widget téma — default `light`; M5)
- last_capture_at timestamptz
- last_error text
- created_at, updated_at

**images**
- id uuid PK
- camera_id FK → cameras
- timestamp timestamptz
- storage_key text (cesta v MinIO)
- size_bytes int
- created_at

Index: `images (camera_id, timestamp DESC)`.

### Úložiště MinIO

```
org/{tenant_slug}/{camera_id}/{YYYY-MM-DD}/{HHMMSS}.jpg
```

## 6. Capture worker

- In-process scheduler; rozvrh načítá z Postgres každých 60 s.
- Pro každou enable kameru: kontrola intervalu + aktivního okna (timezone kamery) → capture.
- Job paralelizace: maximální shluk N souběžných capture (pro RTSP/ffmpeg zamezení zahlcení CPU).

### Adaptéry (rozhraní `capture(feed): Promise<Buffer>`)

| Typ | Implementace |
|---|---|
| static_url | HTTP GET → JPEG body |
| mjpeg | HTTP stream, čtení multipart boundary → první JPEG frame |
| hls | `ffmpeg -i {url} -frames:v 1 -q:v 2 pipe:1` |
| rtsp | `ffmpeg -rtsp_transport tcp -i {url} -frames:v 1 -q:v 2 pipe:1` |
| custom | port stávajícího PHP WebSocket klienta (kitesport protokol) |

### Ukládání a chyby

- Záznam: PUT do MinIO, INSERT do images (camera_id, timestamp, storage_key, size_bytes).
- Chybový režim: 1× retry s 30s backoff → při trvalém selhání zapíše camera.last_error a označí stav; žádné mazání dat.
- Měření size_bytes → zdroj pro billing (ano: reálné náklady místo odhadu).

## 7. Widget témata (M5)

- Presetové styly widgetu volitelné **per kamera** (`cameras.theme`, default `light`).
- Nabízené varianty: světlý/tmavý + pár barevných schémat — žádná volná customizace, žádné vlastní logo.
- Výběr v adminu (M2/M5) i přepis přes query param v embed kódu:
  `<iframe src=".../widget/{tenant}/{camera}?theme=dark">`
- Nejedná se o white-label (ten zůstává mimo rozsah).

## 8. Retenční brána

Plné ukládání do stropu platformy (36 měsíců), žádné fyzické mazání při downgrade. Brána v API:

```sql
WHERE camera_id = :cam AND timestamp >= NOW() - INTERVAL 'X months'
  AND DATE(timestamp) = :date
```

- Upgrade → okamžitě zpřístupní starší historii.
- Downgrade → účinné od dalšího fakturačního cyklu (mimo MVP; M4).

## 9. API

**Veřejné (bez auth, widget + WP plugin):**
- `GET /api/v1/cameras/:cameraId/images?date=YYYY-MM-DD` — snímky dne v rámci retence
- `GET /api/v1/cameras/:cameraId/file/:imageId` — snímek (redirect na MinIO presigned URL)
- `GET /api/v1/health` — healthcheck

**Admin (JWT, tenant-scoped):**
- `POST /api/v1/auth/register` | `POST /api/v1/auth/login`
- `GET/POST/PUT/DELETE /api/v1/admin/cameras`
- `GET /api/v1/admin/cameras/:id/preview` — poslední snímek
- `GET /api/v1/admin/billing` — tarif + využití (M4)

Principy: veřejná data bez auth; rate limiting 100 req/min veřejné + 300 req/min admin; JWT 15 min access + 7 dní refresh (httpOnly); argon2id hesla; SQL filtrace vždy přes tenant_id z JWT; chyby ve struktuře RFC 7807.

## 10. Frontend — widget

Adresa: `https://{domena}/widget/{tenant_slug}/{camera_id}`

- Port Box.js: date picker, časová osa snímků, sdílení (FB/X/WhatsApp/Telegram), navigace šipkami, URL parametry `?date=&hour=`.
- Bez auth, neutrální branding.
- Vite + React, optimalizovaný bundle.

**Embed kód (iframe):**
```html
<iframe src="https://{domena}/widget/{tenant}/{camera}" style="width:100%;height:600px;border:0;" frameborder="0" allowfullscreen></iframe>
```

## 11. WordPress plugin (M3)

PHP plugin, tenký klient:
- Shortcode `[camera-history tenant="slug" camera="camera-id"]`
- Admin stránka s rozbalovacím seznamem kamer (API přes tenant klíč)
- Generuje the iframe; cache seznamu kamer.
- Trade-off: závislý na dostupnosti SaaS API — při výpadku se widget nenačte (daň tenkého klienta), stránka klienta se nezbortí.

## 12. Bezpečnost

- Credentials pouze v `.env`, nikdy v gitu.
- Argon2id hesla, JWT httpOnly cookies, tenant scoping v SQL.
- Capture: povolená schémata http/https/rtsp + domain allowlist per kamera (anti-SSRF).
- Rate limiting, RFC 7807, security headers na nginx.

## 13. Cenová matice (M4, výchozí)

| Retence | €/kamera/měsíc |
|---|---|
| 14 dní | 5 |
| 1 měsíc | 9 |
| 3 měsíce | 15 |
| 6 měsíců | 22 |
| **12 měsíců (default)** | **29** |
| 24 měsíců | 49 |
| 36 měsíců (strop) | 69 |

WP plugin zdarma. Billing z reálných size_bytes měřených workerem; ceník přeladitelný.

## 14. Testy

- Unit: adaptéry (mocky feedů), retenční brána, billing kalkulátor.
- Integration: worker → MinIO + Postgres; API end-to-end.
- E2E (Playwright): widget v iframe, admin flow (registrace → kamera → embed), error stavy.
- framework: Vitest + Playwright (React Testing Library).

## 15. Milníky

1. **M1 — Jádro SaaS:** monorepo, Postgres/MinIO, static_url adaptér, API s retencí, widget + embed. Prodejné po první kameře.
2. **M2 — Admin dashboard + všechny feed typy** (MJPEG, HLS, RTSP, custom), výpadky, náhled.
3. **M3 — WordPress plugin.**
4. **M4 — Billing:** fakturace, stropy, upgrade/downgrade.
5. **M5 — Widget themes:** presetové styly widgetu per kamera + `?theme=` v embed kódu.

## 16. Co je mimo rozsah

- White-label branding (vlastní logo klienta) — presetové widget témata (M5) jsou v rozsahu, volná customizace ne.
- Fyzické mazání dat podle retence.
- Auth pro veřejnou timeline.