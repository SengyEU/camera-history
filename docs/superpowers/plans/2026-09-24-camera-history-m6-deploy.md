# M6 — Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full SaaS deployable with `docker compose` on a VPS: compose services for all 5 containers, DB migrations run at api startup, the web container serves both the widget and the admin SPA, and a README runbook documents the VPS/nginx/Cloudflare steps.

**Architecture:** One `docker-compose.yml` keeps postgres/minio (published only on 127.0.0.1 for dev convenience) and adds `api` (3000), `worker` (no port), `web` (8080→80, custom nginx serving `/` widget + `/admin/` admin). The api image copies the drizzle migrations folder and runs the compiled migrator before the server. The web image builds both Vite SPAs.

**Tech Stack:** docker compose, node:20-alpine / nginx:1.27-alpine, drizzle-orm migrator, Vite.

## Global Constraints

- No source changes to the 6 workspace packages except `packages/api/Dockerfile` and `packages/web/Dockerfile` (build config only). No new deps.
- Spec §3: api → 127.0.0.1:3000, web → 127.0.0.1:8080, postgres/minio stay on 127.0.0.1 (documented deviation).
- Admin SPA served at `/admin/` (its vite `base` is already `/admin/`).
- DB migrations: idempotent, run at api container startup. `migrate.ts` resolves `migrationsFolder: "drizzle"` relative to CWD → folder must be at `/app/drizzle` in the image.
- Inside compose, `DATABASE_URL`/`MINIO_ENDPOINT` use service hostnames (`postgres`/`minio`), never `127.0.0.1`.
- nginx in the web container listens on port 80 (default); compose maps `127.0.0.1:8080:80`.
- Commit style: `feat(ops): ...`, `docs: ...`. One commit per task.

---

### Task 1: `docker-compose.yml` — app services (api, worker, web)

**Files:**
- Modify: `docker-compose.yml` (full rewrite; keep postgres/minio as-is, add healthcheck for minio)

**Interfaces:**
- Consumes: existing Dockerfiles (`packages/api/Dockerfile`, `packages/worker/Dockerfile`, `packages/web/Dockerfile`) — environment vars come from `.env` with safe defaults (config.ts reads the same names).
- Produces: 5 services named `postgres`, `minio`, `api`, `worker`, `web`; `api` and `web` with published localhost ports; env for api/worker identical to config.ts var names.

- [ ] **Step 1: Create `.dockerignore`**

Create `.dockerignore` at the repo root (build context is the repo root; keep it small):

```
node_modules
**/node_modules
**/dist
.git
.gitignore
docs
legacy
scripts
.env
.env.*
```

- [ ] **Step 2: Rewrite `docker-compose.yml`**

Important: the Dockerfiles use repo-relative paths (`COPY package.json ...`, `COPY packages/core ...`), so the build context is the **repo root** for every app service.

Replace the entire file with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-camera}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-camera}
      POSTGRES_DB: ${POSTGRES_DB:-camera_history}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-camera}"]
      interval: 2s
      timeout: 2s
      retries: 20

  minio:
    image: quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null || exit 1"]
      interval: 3s
      timeout: 3s
      retries: 20

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-camera}:${POSTGRES_PASSWORD:-camera}@postgres:5432/${POSTGRES_DB:-camera_history}
      MINIO_ENDPOINT: minio
      MINIO_PORT: "9000"
      MINIO_USE_SSL: "false"
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY:-minioadmin}
      MINIO_BUCKET: ${MINIO_BUCKET:-org}
      JWT_SECRET: ${JWT_SECRET:-dev-secret-change-me}
      JWT_ACCESS_TTL_SECONDS: ${JWT_ACCESS_TTL_SECONDS:-900}
      JWT_REFRESH_TTL_SECONDS: ${JWT_REFRESH_TTL_SECONDS:-604800}
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-http://localhost:8080}
      STRIPE_ENABLED: ${STRIPE_ENABLED:-false}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
      STRIPE_PRICE_0_5: ${STRIPE_PRICE_0_5:-}
      STRIPE_PRICE_1: ${STRIPE_PRICE_1:-}
      STRIPE_PRICE_3: ${STRIPE_PRICE_3:-}
      STRIPE_PRICE_6: ${STRIPE_PRICE_6:-}
      STRIPE_PRICE_12: ${STRIPE_PRICE_12:-}
      STRIPE_PRICE_24: ${STRIPE_PRICE_24:-}
      STRIPE_PRICE_36: ${STRIPE_PRICE_36:-}
      BILLING_GRACE_DAYS: ${BILLING_GRACE_DAYS:-3}
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 3s
      timeout: 3s
      retries: 30
      start_period: 10s

  worker:
    build:
      context: .
      dockerfile: packages/worker/Dockerfile
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-camera}:${POSTGRES_PASSWORD:-camera}@postgres:5432/${POSTGRES_DB:-camera_history}
      MINIO_ENDPOINT: minio
      MINIO_PORT: "9000"
      MINIO_USE_SSL: "false"
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY:-minioadmin}
      MINIO_BUCKET: ${MINIO_BUCKET:-org}
      WORKER_TICK_MS: ${WORKER_TICK_MS:-60000}
      WORKER_RETRY_BACKOFF_MS: ${WORKER_RETRY_BACKOFF_MS:-30000}
      WORKER_CONCURRENCY: ${WORKER_CONCURRENCY:-2}
      FEED_TIMEOUT_MS: ${FEED_TIMEOUT_MS:-15000}
      FEED_MAX_BYTES: ${FEED_MAX_BYTES:-5242880}
      STRIPE_ENABLED: ${STRIPE_ENABLED:-false}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
      STRIPE_PRICE_0_5: ${STRIPE_PRICE_0_5:-}
      STRIPE_PRICE_1: ${STRIPE_PRICE_1:-}
      STRIPE_PRICE_3: ${STRIPE_PRICE_3:-}
      STRIPE_PRICE_6: ${STRIPE_PRICE_6:-}
      STRIPE_PRICE_12: ${STRIPE_PRICE_12:-}
      STRIPE_PRICE_24: ${STRIPE_PRICE_24:-}
      STRIPE_PRICE_36: ${STRIPE_PRICE_36:-}
      BILLING_GRACE_DAYS: ${BILLING_GRACE_DAYS:-3}
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    ports:
      - "127.0.0.1:8080:80"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO", "/dev/null", "http://127.0.0.1/"]
      interval: 3s
      timeout: 3s
      retries: 20

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 3: Validate compose config**

Run: `docker compose config -q`
Expected: exit 0, no output (config valid).

- [ ] **Step 4: Commit**

```bash
git add .dockerignore docker-compose.yml
git commit -m "feat(ops): compose services for api worker web"
```

---

### Task 2: `packages/api/Dockerfile` — DB migrations on startup

**Files:**
- Modify: `packages/api/Dockerfile`

**Interfaces:**
- Consumes: `packages/db/dist/migrate.js` + `packages/db/drizzle/` from the build stage; env `DATABASE_URL`.
- Produces: api image that runs `node packages/db/dist/migrate.js` (idempotent) then `node packages/api/dist/server.js`; migrations folder at `/app/drizzle` (CWD-relative `"drizzle"` per `migrate.ts`).

- [ ] **Step 1: Rewrite `packages/api/Dockerfile`**

Replace the entire file with:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/api packages/api
RUN npm install --workspace @ch/core --workspace @ch/db --workspace @ch/api
RUN npm run build --workspace @ch/core --workspace @ch/db --workspace @ch/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/drizzle drizzle
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["sh", "-c", "node packages/db/dist/migrate.js && node packages/api/dist/server.js"]
```

- [ ] **Step 2: Build the image**

Run: `docker compose build api`
Expected: build succeeds; runtime stage contains `/app/drizzle` and `/app/packages/db/dist/migrate.js`.

- [ ] **Step 3: Verify migrate resolves the folder**

Run: `docker run --rm --entrypoint sh camera-history-api -c "ls /app/drizzle && node -e \"console.log(require('path').resolve('drizzle'))\""`
Expected: lists 3 `.sql` files; prints `/app/drizzle`. (If the image name differs, check `docker compose build api` output for the tagged name and adjust.)

- [ ] **Step 4: Commit**

```bash
git add packages/api/Dockerfile
git commit -m "feat(ops): api image runs db migrations on startup"
```

---

### Task 3: `packages/web/Dockerfile` + `nginx.conf` — widget and admin

**Files:**
- Modify: `packages/web/Dockerfile`
- Create: `packages/web/nginx.conf`

**Interfaces:**
- Consumes: admin SPA (`base: "/admin/"` in its vite config, outDir `dist`); widget SPA (`base: "/"`).
- Produces: nginx serving `location /admin/` → `/usr/share/nginx/html/admin/` (with SPA fallback `/admin/index.html`), `location /widget/` → widget index (SPA fallback), everything else → widget static. Listens on 80.

- [ ] **Step 1: Create `packages/web/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /admin/ {
        alias /usr/share/nginx/html/admin/;
        try_files $uri $uri/ /admin/index.html;
    }

    location /widget/ {
        try_files $uri /index.html;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

- [ ] **Step 2: Rewrite `packages/web/Dockerfile`**

Replace the entire file with:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/web packages/web
COPY packages/admin packages/admin
RUN npm install --workspace @ch/web --workspace @ch/admin
RUN npm run build --workspace @ch/web --workspace @ch/admin

FROM nginx:1.27-alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY --from=build /app/packages/admin/dist /usr/share/nginx/html/admin
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Build the image**

Run: `docker compose build web`
Expected: build succeeds; `/usr/share/nginx/html/index.html` and `/usr/share/nginx/html/admin/index.html` both present.

- [ ] **Step 4: Commit**

```bash
git add packages/web/Dockerfile packages/web/nginx.conf
git commit -m "feat(ops): web image serves widget and admin under nginx"
```

---

### Task 4: README — M6 section

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1–3 compose/Dockerfiles; spec §3 (nginx site, certbot, Cloudflare).
- Produces: README documentation of build/start, production `.env` values, and the VPS runbook (host nginx site, certbot DNS-01, Cloudflare Origin Rule).

- [ ] **Step 1: Append the M6 section**

Append at the end of `README.md`:

```md
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: M6 deploy runbook"
```

---

### Task 5: Local smoke — full stack end-to-end

**Files:** none (no source changes expected).

**Interfaces:**
- Consumes: Tasks 1–4; `docker compose`, host `node`, `curl`.
- Produces: proven running stack (DB → api → worker → MinIO → widget/admin), then torn down.

- [ ] **Step 1: Prepare feed fixture and static server**

```bash
mkdir -p /tmp/m6smoke
printf '\xff\xd8\xff\xe0\0\x10JFIF\0\1\1\0\0\1\0\1\0\0\xff\xd9' > /tmp/m6smoke/test.jpg
node -e "const http=require('http'),fs=require('fs');http.createServer((q,r)=>{r.setHeader('Content-Type','image/jpeg');r.end(fs.readFileSync('/tmp/m6smoke/test.jpg'))}).listen(8000,'0.0.0.0')" &
echo $! > /tmp/m6smoke/feed.pid
sleep 1
curl -fsS http://127.0.0.1:8000/test.jpg -o /dev/null && echo "feed OK"
```
Expected: "feed OK". (JPEG bytes are a placeholder — the static_url adapter only fetches and stores; the widget preview will render a broken image but the capture pipeline is fully verified.)

- [ ] **Step 2: Build and start the stack**

```bash
docker compose build
docker compose up -d
```
Expected: 5 containers; `docker compose ps` shows all `Up` (postgres/minio/api/web healthy).

- [ ] **Step 3: Wait for api health**

```bash
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3000/api/v1/health && break; sleep 2; done
```
Expected: prints `{"status":"ok"}` (or similar) and stops looping. If stuck, inspect `docker compose logs api` (migrations should say "migrations applied").

- [ ] **Step 4: Register tenant, login, create camera**

```bash
curl -fsS -c /tmp/m6smoke/cj -X POST http://127.0.0.1:3000/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Smoke","slug":"smoke","email":"smoke@example.dev","password":"password123"}'
curl -fsS -c /tmp/m6smoke/cj -b /tmp/m6smoke/cj -X POST http://127.0.0.1:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.dev","password":"password123"}'
GW=$(docker inspect "$(docker compose ps -q api)" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$v.Gateway}}{{end}}')
echo "gateway=$GW"
curl -fsS -b /tmp/m6smoke/cj -X POST http://127.0.0.1:3000/api/v1/admin/cameras -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test cam\",\"feedType\":\"static_url\",\"feedUrl\":\"http://$GW:8000/test.jpg\",\"intervalMinutes\":5,\"activeFrom\":\"00:00\",\"activeTo\":\"23:59\",\"timezone\":\"UTC\",\"theme\":\"forest\"}" \
  | tee /tmp/m6smoke/cam.json
```
Expected: register/login succeed; create returns `201` with a camera carrying `theme:"forest"`.

- [ ] **Step 5: Wait for the first capture (~7 min max)**

```bash
CID=$(node -e 'console.log(require("/tmp/m6smoke/cam.json").camera.id)')
for i in $(seq 1 16); do
  D=$(date -u +%F)
  N=$(curl -fsS "http://127.0.0.1:3000/api/v1/cameras/$CID/images?date=$D" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))')
  echo "poll $i: images=$N"
  [ "$N" -ge 1 ] && break
  sleep 30
done
```
Expected: eventually `images=1`. Also check worker logs:

```bash
docker compose logs worker | tail -20
```
Expected: worker log lines showing the scheduled capture / "captured"/stored image (exact wording from `packages/worker/src/captureRun.ts`).

- [ ] **Step 6: Verify widget and admin routing**

```bash
CID=$(node -e 'console.log(require("/tmp/m6smoke/cam.json").camera.id)')
echo "widget status:"; curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8080/widget/smoke/$CID"
echo "widget html:";     curl -fsS "http://127.0.0.1:8080/widget/smoke/$CID" | head -c 200; echo
echo "admin status:";    curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/admin/
echo "admin html:";      curl -fsS http://127.0.0.1:8080/admin/ | head -c 200; echo
WIDGET_JS=$(curl -fsS "http://127.0.0.1:8080/widget/smoke/$CID" | grep -o '/assets/[^"]*\.js' | head -1)
echo "widget js: $WIDGET_JS"; curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8080$WIDGET_JS"
ADMIN_JS=$(curl -fsS http://127.0.0.1:8080/admin/ | grep -o '/admin/assets/[^"]*\.js' | head -1)
echo "admin js: $ADMIN_JS"; curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8080$ADMIN_JS"
```
Expected: widget 200 + SPA html, admin 200 + SPA html, both JS assets 200.

- [ ] **Step 7: Repo gates**

Run: `npm run typecheck && npm run test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 8: Teardown and cleanliness check**

```bash
kill "$(cat /tmp/m6smoke/feed.pid)" 2>/dev/null || true
docker compose down -v
git status --porcelain
```
Expected: containers stopped and volumes removed; `git status` clean except the already-committed docs (spec/plan files under `docs/superpowers/`).

- [ ] **Step 9: Report**

Summarize: compose topology, migration-at-startup behavior, widget+admin routing under web container, capture pipeline verification (API → MinIO → images list), gate results, and confirm VPS runbook is in README (steps left to the user because they need credentials).