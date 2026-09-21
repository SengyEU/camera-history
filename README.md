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