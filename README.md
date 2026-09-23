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