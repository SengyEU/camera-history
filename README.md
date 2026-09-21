# Camera History — SaaS

Multi-tenant SaaS pro resorty a skiareály: periodické snímkování venkovních kamer + veřejná embedovatelná historie.

- Monorepo: `packages/{core,db,worker,api,web}` (viz design doc `docs/superpowers/specs/`)
- Stack: TypeScript, Node (Fastify), Postgres (drizzle), MinIO, React (Vite)
- Legacy kód z původní single-camera verze: `legacy/`

## Dev setup

1. `npm install`
2. `docker compose up -d postgres minio`
3. `npm run db:migrate` (vyžaduje běžící Postgres)
4. `npm run dev:api` a `npm run dev:web` (každý v samostatném terminálu)
5. `npm run dev:worker` (capture)

## Embed widgetu

Pokud API a web běží na stejném origin (např. `camera.sengycraft.cz`), vloží se widget jako iframe:

```html
<iframe
  src="https://camera.sengycraft.cz/widget/{tenant_slug}/{camera_id}"
  style="width:100%;height:600px;border:0;"
  frameborder="0" allowfullscreen></iframe>
```