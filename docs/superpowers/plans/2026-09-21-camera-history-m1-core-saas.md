# M1 — Jádro SaaS: monorepo, Postgres/MinIO, static_url adapter, API s retencí, widget

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit prodejné jádro multi-tenant SaaS — TypeScript monorepo s capture workerem (static_url), retenčním API a embedovatelným widgetem.

**Architecture:** Monorepo (npm workspaces) s balíčky `core` (typy/config/retence), `db` (drizzle schema + repos + MinIO storage), `worker` (scheduler + static_url adapter), `api` (Fastify, retenční brána, JWT), `web` (Vite+React widget). Reálná Postgres/MinIO se používá v integračních testech; unit testy běží na fake repos/storage.

**Tech Stack:** TypeScript 5, npm workspaces, Fastify 5, drizzle-orm/node-postgres, MinIO, jose (JWT), @node-rs/argon2, React 18 + Vite 6, Vitest 3, Playwright.

## Global Constraints

- **Stack:** TypeScript napříč stackem; Node >= 20; `"type": "module"` pro všechny balíčky.
- **Retence:** default `plan_months = 12`, strop platformy 36, žádné fyzické mazání. API vrací jen `timestamp >= cutoff AND DATE(timestamp) = date`.
- **Feed typy:** `static_url | mjpeg | hls | rtsp | custom`. V M1 implementován **pouze `static_url`**; ostatní v API povolené, ve workeru vyhodí "not implemented".
- **Interval kamer:** `5 | 15 | 30 | 60` minut; aktivní okno `active_from/active_to` ("HH:mm") v `timezone` kamery; `active_from == active_to` = celý den.
- **Storage path:** `org/{tenant_slug}/{camera_id}/{YYYY-MM-DD}/{HHMMSS}.jpg`.
- **API:** veřejné endpointy bez auth; admin endpointy JWT (access 15 min / refresh 7 dní, httpOnly cookies `ch_access`, `ch_refresh`); chyby ve tvaru RFC 7807; rate limiting 100 req/min veřejné, 300 req/min admin.
- **Porty:** dev compose publikuje jen `127.0.0.1:5432` (postgres) a `127.0.0.1:9000/9001` (minio). API interní 3000, web 8080. Žádné `ports:` pro api/worker/web v compose (M1 dev běží přes npm).
- **Bezpečnost:** `.env` v `.gitignore`; credentials nikdy v gitu; capture jen schémata `http:`/`https:` (anti-SSRF) + JPEG magic-byte validace + limit velikosti.
- **UUID** PK pro všechny tabulky; timestamps `timestamptz`.
- **Datový model** přesně dle spec sekce 5 (tenants, users, cameras, images) + index `images (camera_id, timestamp DESC)`.
- Legacy PHP/CRA soubory se **nemažou**, přesouvají se do `legacy/` (Task 1). `build/` (deployed artifact) zůstává na místě a je gitignored.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root), `tsconfig.base.json`, `.gitignore` (přidat), `.env.example`, `legacy/.gitkeep`
- Move: `api.php`, `worker.php`, `getimage.php`, `db.php`, `src/`, `public/` → `legacy/`
- Modify: `README.md`

**Interfaces:**
- Produces: root workspaces pod názvy `@ch/core`, `@ch/db`, `@ch/worker`, `@ch/api`, `@ch/web`; skripty `build`, `test`, `typecheck`, `lint`, `clean`.

- [ ] **Step 1: Write the failing test (root scripts exist)**

Create `package.json`:

```json
{
  "name": "camera-history-saas",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "clean": "npm run clean --workspaces --if-present",
    "db:generate": "npm run db:generate --workspace @ch/db",
    "db:migrate": "npm run db:migrate --workspace @ch/db",
    "dev:api": "npm run dev --workspace @ch/api",
    "dev:worker": "npm run dev --workspace @ch/worker",
    "dev:web": "npm run dev --workspace @ch/web"
  },
  "devDependencies": {
    "eslint": "^9.14.0",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.15.0"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Create `eslint.config.js` (flat config):

```js
// eslint.config.js
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/build/**", "legacy/**"] },
  ...tseslint.configs.recommended
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run typecheck`
Expected: exits non-zero with "No workspaces" / no `@ch/*` packages yet (workspaces directory empty). This is the failing state.

- [ ] **Step 3: Implement scaffold**

Create `.gitignore` (přidej k existujícímu obsahu):

```gitignore
# env
.env
.env.*
!.env.example

# build artifacts
**/dist/

# coverage
coverage/

# playwright
test-results/
playwright-report/
```

Create `.env.example`:

```bash
# Postgres (docker-compose dev)
POSTGRES_USER=camera
POSTGRES_PASSWORD=camera
POSTGRES_DB=camera_history
DATABASE_URL=postgres://camera:camera@127.0.0.1:5432/camera_history

# MinIO (docker-compose dev)
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=org

# API / JWT
JWT_SECRET=change-me-in-production
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=604800
API_PORT=3000
PUBLIC_BASE_URL=http://localhost:8080

# Worker
WORKER_TICK_MS=60000
WORKER_RETRY_BACKOFF_MS=30000
WORKER_CONCURRENCY=2
FEED_TIMEOUT_MS=15000
FEED_MAX_BYTES=5242880
```

Move legacy files:

```bash
mkdir -p legacy
git mv api.php worker.php getimage.php db.php legacy/
git mv src public legacy/
```

Create `legacy/README.md`:

```markdown
# Legacy (původní single-camera verze)

PHP worker + React CRA z prvotní verze (Kite Sport Centre). Zachováno pro referenci; nenahrazuje nové balíčky pod `packages/`. Deployed artifact `build/` zůstává na úrovni root.
```

Update `README.md`:

```markdown
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
```

Delete the old `.gitignore` CRA sections that are now obsolete only if harmless; keep the file.

- [ ] **Step 4: Verify scaffold**

Run: `npm install`
Expected: succeeds, creates `node_modules`, warns "no package.json found" is NOT shown (works below in Task 2 creates packages).

Note: workspaces remain empty until Tasks 2–10 create each package. Run `npm install` again at the end of each package task.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo, move legacy to legacy/"
```

---

### Task 2: Core package — typy, konfigurace, retence

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/types.ts`, `packages/core/src/config.ts`, `packages/core/src/retention.ts`, `packages/core/src/errors.ts`, `packages/core/test/retention.test.ts`, `packages/core/test/config.test.ts`
- Create: `packages/core/.gitignore` (dist)

**Interfaces:**
- Produces: `@ch/core`:
  - `export type FeedType`, `UserRole`, `interface Tenant`, `User`, `Camera`, `ImageRecord`, `PublicCamera`
  - `export function loadConfig(env: NodeJS.ProcessEnv): AppConfig`
  - `export function dayRangeUtc(dateStr: string): { start: Date; end: Date }`
  - `export function retentionCutoff(months: number, now?: Date): Date`
  - `export function gatedRange(dayStart: Date, dayEnd: Date, cutoff: Date): { start: Date; end: Date }`
  - `export class HttpError extends Error { status: number; detail: string }`, `export function rfc7807(status, title, detail)`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/types.ts`:

```ts
export type FeedType = "static_url" | "mjpeg" | "hls" | "rtsp" | "custom";
export type UserRole = "owner" | "admin";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  planMonths: number;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface Camera {
  id: string;
  tenantId: string;
  name: string;
  feedType: FeedType;
  feedUrl: string;
  feedConfig: Record<string, unknown>;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
  enabled: boolean;
  theme: string;
  lastCaptureAt: string | null;
  lastError: string | null;
}

export interface ImageRecord {
  id: string;
  cameraId: string;
  timestamp: string;
  storageKey: string;
  sizeBytes: number;
}

export interface PublicCamera {
  id: string;
  name: string;
  theme: string;
  retentionMonths: number;
}

export interface NewTenant {
  name: string;
  slug: string;
  planMonths?: number;
}

export interface NewUser {
  tenantId: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export interface NewCamera {
  name: string;
  feedType: FeedType;
  feedUrl: string;
  feedConfig?: Record<string, unknown>;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
  enabled?: boolean;
}

export interface CameraPatch {
  name?: string;
  feedType?: FeedType;
  feedUrl?: string;
  feedConfig?: Record<string, unknown>;
  intervalMinutes?: number;
  activeFrom?: string;
  activeTo?: string;
  timezone?: string;
  enabled?: boolean;
  theme?: string;
}

export interface NewImage {
  cameraId: string;
  timestamp: Date;
  storageKey: string;
  sizeBytes: number;
}
```

`packages/core/src/retention.ts`:

```ts
export function dayRangeUtc(dateStr: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`invalid date: ${dateStr}`);
  const [, y, m, d] = match;
  const start = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
  const end = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 24, 0, 0));
  return { start, end };
}

export function retentionCutoff(months: number, now: Date = new Date()): Date {
  if (months < 1) throw new RangeError("months must be >= 1");
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function gatedRange(
  dayStart: Date,
  dayEnd: Date,
  cutoff: Date,
): { start: Date; end: Date } {
  const end = dayEnd > cutoff ? dayEnd : cutoff;
  return { start: dayStart > cutoff ? dayStart : cutoff, end };
}
```

`packages/core/src/errors.ts`:

```ts
export interface Rfc7807Error {
  type: string;
  title: string;
  status: number;
  detail: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  constructor(status: number, title: string, detail: string) {
    super(detail);
    this.name = "HttpError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export function rfc7807(status: number, title: string, detail: string): Rfc7807Error {
  return { type: "about:blank", title, status, detail };
}
```

`packages/core/test/retention.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayRangeUtc, gatedRange, retentionCutoff } from "../src/retention.js";

describe("dayRangeUtc", () => {
  it("parses YYYY-MM-DD into exclusive UTC day range", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    expect(start.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("rejects malformed dates", () => {
    expect(() => dayRangeUtc("18-09-2026")).toThrow(RangeError);
  });
});

describe("retentionCutoff", () => {
  it("subtracts calendar months from now", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    const cutoff = retentionCutoff(12, now);
    expect(cutoff.toISOString()).toBe("2025-09-18T12:00:00.000Z");
  });

  it("clamps to end-of-month correctly", () => {
    const now = new Date("2026-03-31T00:00:00.000Z");
    const cutoff = retentionCutoff(1, now);
    expect(cutoff.getUTCMonth()).toBe(2); // únor
  });
});

describe("gatedRange", () => {
  it("keeps full day when cutoff predates day", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const range = gatedRange(start, end, cutoff);
    expect(range.start.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("truncates start when cutoff falls mid-day", () => {
    const { start, end } = dayRangeUtc("2026-09-18");
    const cutoff = new Date("2026-09-18T10:00:00.000Z");
    const range = gatedRange(start, end, cutoff);
    expect(range.start.toISOString()).toBe("2026-09-18T10:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});
```

`packages/core/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("fills defaults", () => {
    const cfg = loadConfig({});
    expect(cfg.worker.tickMs).toBe(60000);
    expect(cfg.plan.defaultRetentionMonths).toBe(12);
  });

  it("loads DATABASE_URL", () => {
    const cfg = loadConfig({ DATABASE_URL: "postgres://a:b@h:5432/db" });
    expect(cfg.databaseUrl).toBe("postgres://a:b@h:5432/db");
  });

  it("reads feed limits", () => {
    const cfg = loadConfig({ FEED_MAX_BYTES: "1000" });
    expect(cfg.feed.maxBytes).toBe(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Create `packages/core/package.json`:

```json
{
  "name": "@ch/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

Create `packages/core/src/index.ts`:

```ts
export * from "./types.js";
export * from "./config.js";
export * from "./retention.js";
export * from "./errors.js";
```

(Config still missing → test fails at import.)

Run: `npm install && npm run test --workspace @ch/core`
Expected: FAIL (config.js missing / module errors).

- [ ] **Step 3: Implement config**

Create `packages/core/src/config.ts`:

```ts
import { z } from "zod";

const numeric = (defaultValue: number) =>
  z.coerce.number().default(defaultValue).pipe(z.number().finite());

const AppConfigSchema = z.object({
  databaseUrl: z.string().url().default("postgres://camera:camera@127.0.0.1:5432/camera_history"),
  minio: z.object({
    endpoint: z.string().default("127.0.0.1"),
    port: numeric(9000),
    useSsl: z.coerce.boolean().default(false),
    accessKey: z.string().min(1).default("minioadmin"),
    secretKey: z.string().min(1).default("minioadmin"),
    bucket: z.string().min(1).default("org"),
  }),
  jwt: z.object({
    secret: z.string().min(16).default("dev-secret-change-me"),
    accessTtlSeconds: numeric(900),
    refreshTtlSeconds: numeric(604800),
  }),
  api: z.object({
    port: numeric(3000),
    publicBaseUrl: z.string().default("http://localhost:8080"),
  }),
  worker: z.object({
    tickMs: numeric(60000),
    retryBackoffMs: numeric(30000),
    concurrency: numeric(2),
  }),
  feed: z.object({
    timeoutMs: numeric(15000),
    maxBytes: numeric(5242880),
  }),
  plan: z.object({
    defaultRetentionMonths: numeric(12),
    maxRetentionMonths: numeric(36),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return AppConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
    minio: {
      endpoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSsl: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucket: env.MINIO_BUCKET,
    },
    jwt: {
      secret: env.JWT_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    },
    api: { port: env.API_PORT, publicBaseUrl: env.PUBLIC_BASE_URL },
    worker: {
      tickMs: env.WORKER_TICK_MS,
      retryBackoffMs: env.WORKER_RETRY_BACKOFF_MS,
      concurrency: env.WORKER_CONCURRENCY,
    },
    feed: { timeoutMs: env.FEED_TIMEOUT_MS, maxBytes: env.FEED_MAX_BYTES },
    plan: {
      defaultRetentionMonths: env.PLAN_DEFAULT_RETENTION_MONTHS,
      maxRetentionMonths: env.PLAN_MAX_RETENTION_MONTHS,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace @ch/core`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @ch/core`
Expected: PASS with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): types, config, retention helpers"
```

---

### Task 3: DB package — drizzle schema + migrace

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/schema.ts`, `packages/db/src/db.ts`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`, `packages/db/.gitignore`
- Create (generated): `packages/db/drizzle/` migration files

**Interfaces:**
- Consumes: `@ch/core` (typy, `New*`).
- Produces: `@ch/db`:
  - `export const tables = { tenants, users, cameras, images }`
  - `export function createDb(url: string): Db` (drizzle instance s `pg` pool)
  - `getConnectionStringFromConfig(cfg: AppConfig): string`

- [ ] **Step 1: Write schema**

`packages/db/package.json`:

```json
{
  "name": "@ch/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "@ch/core": "*",
    "drizzle-orm": "^0.38.3",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.2",
    "@types/pg": "^8.11.10",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^3.0.0"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

`packages/db/src/schema.ts` (odpovídá spec sekci 5):

```ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  time,
  uniqueIndex,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

export const feedTypeEnum = pgEnum("feed_type", [
  "static_url",
  "mjpeg",
  "hls",
  "rtsp",
  "custom",
]);

export const userRoleEnum = pgEnum("user_role", ["owner", "admin"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  planMonths: integer("plan_months").notNull().default(12),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tenants_slug_unique").on(t.slug),
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
]);

export const cameras = pgTable("cameras", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  feedType: feedTypeEnum("feed_type").notNull(),
  feedUrl: text("feed_url").notNull(),
  feedConfig: jsonb("feed_config").$type<Record<string, unknown>>().notNull().default({}),
  intervalMinutes: integer("interval_minutes").notNull().default(15),
  activeFrom: time("active_from").notNull().default("00:00"),
  activeTo: time("active_to").notNull().default("23:59"),
  timezone: text("timezone").notNull().default("UTC"),
  enabled: boolean("enabled").notNull().default(true),
  theme: text("theme").notNull().default("light"),
  lastCaptureAt: timestamp("last_capture_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("cameras_tenant_idx").on(t.tenantId),
  index("cameras_enabled_idx").on(t.enabled),
]);

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  cameraId: uuid("camera_id")
    .notNull()
    .references(() => cameras.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  storageKey: text("storage_key").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("images_camera_timestamp_idx").on(t.cameraId, t.timestamp.desc()),
]);

export const tables = { tenants, users, cameras, images };
```

`packages/db/src/db.ts`:

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { tables } from "./schema.js";

export type Db = NodePgDatabase<typeof tables>;

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema: tables }) as Db;
}
```

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://camera:camera@127.0.0.1:5432/camera_history",
  },
});
```

`packages/db/src/migrate.ts`:

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./db.js";

const url = process.env.DATABASE_URL ?? "postgres://camera:camera@127.0.0.1:5432/camera_history";
const db = createDb(url);
await migrate(db, { migrationsFolder: "drizzle" });
const pool = (db.$client as import("pg").Pool);
await pool.end();
console.log("migrations applied");
```

`packages/db/src/index.ts`:

```ts
export * from "./schema.js";
export * from "./db.js";
```

- [ ] **Step 2: Dangerous operation check (read-only verification)**

Run: `npm install && npm run db:generate --workspace @ch/db`
Expected: generates `packages/db/drizzle/0000_*.sql` + meta. This does NOT require a running DB.

Verify generated SQL contains `CREATE TABLE "tenants"`, `CREATE TABLE "images"`, and index `images_camera_timestamp_idx`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @ch/db`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): drizzle schema and migrations"
```

---

### Task 4: DB repos + fake repos pro testy

**Files:**
- Create: `packages/db/src/repos.ts`, `packages/db/src/repos.types.ts`, `packages/db/src/testing/fakeRepos.ts`, `packages/db/test/fakeRepos.test.ts`

**Interfaces:**
- Consumes: `@ch/core` (typy).
- Produces: `@ch/db`:
  - `export interface Repos { ... }` (myšlené):
    ```ts
    interface Repos {
      createTenant(input: NewTenant): Promise<Tenant>;
      getTenantById(id: string): Promise<Tenant | null>;
      getTenantBySlug(slug: string): Promise<Tenant | null>;
      createUser(input: NewUser): Promise<User>;
      getUserByEmail(email: string): Promise<User | null>;
      createCamera(tenantId: string, input: NewCamera): Promise<Camera>;
      getCameraById(id: string): Promise<Camera | null>;
      listCameras(tenantId: string): Promise<Camera[]>;
      updateCamera(id: string, patch: CameraPatch): Promise<Camera | null>;
      deleteCamera(id: string): Promise<void>;
      listEnabledCameras(): Promise<Camera[]>;
      getPublicCamera(cameraId: string): Promise<PublicCamera | null>;
      insertImage(input: NewImage): Promise<ImageRecord>;
      imagesForCameraDay(cameraId: string, from: Date, to: Date): Promise<ImageRecord[]>;
      getImageById(id: string): Promise<ImageRecord | null>;
      latestImageForCamera(cameraId: string): Promise<ImageRecord | null>;
    }
    ```
  - `export function createRepos(db: Db): Repos`
  - `export function createFakeRepos(): Repos & { db: FakeDb }`

- [ ] **Step 1: Write the failing tests**

`packages/db/src/repos.types.ts`:

```ts
import type {
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  Tenant,
  User,
} from "@ch/core";

export interface Repos {
  createTenant(input: NewTenant): Promise<Tenant>;
  getTenantById(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  createUser(input: NewUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  createCamera(tenantId: string, input: NewCamera): Promise<Camera>;
  getCameraById(id: string): Promise<Camera | null>;
  listCameras(tenantId: string): Promise<Camera[]>;
  updateCamera(id: string, patch: CameraPatch): Promise<Camera | null>;
  deleteCamera(id: string): Promise<void>;
  listEnabledCameras(): Promise<Camera[]>;
  getPublicCamera(cameraId: string): Promise<PublicCamera | null>;
  insertImage(input: NewImage): Promise<ImageRecord>;
  imagesForCameraDay(cameraId: string, from: Date, to: Date): Promise<ImageRecord[]>;
  getImageById(id: string): Promise<ImageRecord | null>;
  latestImageForCamera(cameraId: string): Promise<ImageRecord | null>;
}
```

`packages/db/src/testing/fakeRepos.ts`:

```ts
import { randomUUID } from "node:crypto";
import type {
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  Tenant,
  User,
} from "@ch/core";
import type { Repos } from "../repos.types.js";

export interface FakeDb {
  tenants: Tenant[];
  users: User[];
  cameras: Camera[];
  images: ImageRecord[];
}

const nowIso = () => new Date().toISOString();

export function createFakeRepos(seed: Partial<FakeDb> = {}): Repos & { db: FakeDb } {
  const db: FakeDb = {
    tenants: seed.tenants ?? [],
    users: seed.users ?? [],
    cameras: seed.cameras ?? [],
    images: seed.images ?? [],
  };

  const repos: Repos = {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const tenant: Tenant = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        planMonths: input.planMonths ?? 12,
      };
      db.tenants.push(tenant);
      return tenant;
    },
    async getTenantById(id: string) {
      return db.tenants.find((t) => t.id === id) ?? null;
    },
    async getTenantBySlug(slug: string) {
      return db.tenants.find((t) => t.slug === slug) ?? null;
    },
    async createUser(input: NewUser): Promise<User> {
      const user: User = {
        id: randomUUID(),
        tenantId: input.tenantId,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role ?? "owner",
      };
      db.users.push(user);
      return user;
    },
    async getUserByEmail(email: string) {
      return db.users.find((u) => u.email === email) ?? null;
    },
    async createCamera(tenantId: string, input: NewCamera): Promise<Camera> {
      const camera: Camera = {
        id: randomUUID(),
        tenantId,
        name: input.name,
        feedType: input.feedType,
        feedUrl: input.feedUrl,
        feedConfig: input.feedConfig ?? {},
        intervalMinutes: input.intervalMinutes,
        activeFrom: input.activeFrom,
        activeTo: input.activeTo,
        timezone: input.timezone,
        enabled: input.enabled ?? true,
        theme: "light",
        lastCaptureAt: null,
        lastError: null,
      };
      db.cameras.push(camera);
      return camera;
    },
    async getCameraById(id: string) {
      return db.cameras.find((c) => c.id === id) ?? null;
    },
    async listCameras(tenantId: string) {
      return db.cameras.filter((c) => c.tenantId === tenantId);
    },
    async updateCamera(id: string, patch: CameraPatch) {
      const idx = db.cameras.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      const updated: Camera = { ...db.cameras[idx]!, ...patch, id };
      db.cameras[idx] = updated;
      return updated;
    },
    async deleteCamera(id: string) {
      db.cameras = db.cameras.filter((c) => c.id !== id);
      db.images = db.images.filter((i) => i.cameraId !== id);
    },
    async listEnabledCameras() {
      return db.cameras.filter((c) => c.enabled);
    },
    async getPublicCamera(cameraId: string): Promise<PublicCamera | null> {
      const cam = db.cameras.find((c) => c.id === cameraId);
      if (!cam) return null;
      const tenant = db.tenants.find((t) => t.id === cam.tenantId);
      return {
        id: cam.id,
        name: cam.name,
        theme: cam.theme,
        retentionMonths: tenant?.planMonths ?? 12,
      };
    },
    async insertImage(input: NewImage): Promise<ImageRecord> {
      const rec: ImageRecord = {
        id: randomUUID(),
        cameraId: input.cameraId,
        timestamp: input.timestamp.toISOString(),
        storageKey: input.storageKey,
        sizeBytes: input.sizeBytes,
      };
      db.images.push(rec);
      return rec;
    },
    async imagesForCameraDay(cameraId: string, from: Date, to: Date) {
      return db.images
        .filter((i) => i.cameraId === cameraId)
        .filter((i) => {
          const ts = new Date(i.timestamp).getTime();
          return ts >= from.getTime() && ts < to.getTime();
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    },
    async getImageById(id: string) {
      return db.images.find((i) => i.id === id) ?? null;
    },
    async latestImageForCamera(cameraId: string) {
      return (
        db.images.filter((i) => i.cameraId === cameraId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
      );
    },
  };

  return { ...repos, db };
}

// re-export fake types for convenience
export type { FakeDb };
```

`packages/db/test/fakeRepos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFakeRepos } from "../src/testing/fakeRepos.js";

const newTenant = { name: "ACME", slug: "acme" };

describe("fakeRepos", () => {
  it("creates tenant and camera", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    expect(tenant.planMonths).toBe(12);

    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    expect(camera.tenantId).toBe(tenant.id);
  });

  it("inserts and queries images within a day range", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant(newTenant);
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: camera.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: "key-1",
      sizeBytes: 100,
    });
    const rows = await repos.imagesForCameraDay(
      camera.id,
      new Date("2026-09-18T00:00:00Z"),
      new Date("2026-09-19T00:00:00Z"),
    );
    expect(rows).toHaveLength(1);
  });

  it("returns public camera with plan retention", async () => {
    const repos = createFakeRepos();
    const tenant = await repos.createTenant({ ...newTenant, planMonths: 24 });
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const pub = await repos.getPublicCamera(camera.id);
    expect(pub?.retentionMonths).toBe(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install && npm run test --workspace @ch/db`
Expected: FAIL — `repos.ts` a `createRepos` neexistují (fakeRepos.ts importuje `.js` modul, který zatím chybí → typecheck chyba). Fakerepos samotný běží; test selže pouze pokud `repos.types.ts` chybí.

Actually fakeRepos.ts only depends on repos.types.ts (exists). Test should PASS already. Adjust: Step 2 runs and PASSES for fake part — that's the TDD baseline for the interface. The PG `createRepos` is added in Step 3 with its own verification below.

- [ ] **Step 3: Implement PG repositories**

Create `packages/db/src/repos.ts`:

```ts
import { and, eq, gte, lt } from "drizzle-orm";
import type {
  Camera,
  CameraPatch,
  ImageRecord,
  NewCamera,
  NewImage,
  NewTenant,
  NewUser,
  PublicCamera,
  Tenant,
  User,
} from "@ch/core";
import type { Db } from "./db.js";
import { cameras, images, tenants, users } from "./schema.js";
import type { Repos } from "./repos.types.js";

export function createRepos(db: Db): Repos {
  return {
    async createTenant(input: NewTenant): Promise<Tenant> {
      const [row] = await db
        .insert(tenants)
        .values({ name: input.name, slug: input.slug, planMonths: input.planMonths ?? 12 })
        .returning();
      return row!;
    },
    async getTenantById(id: string) {
      const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
      return row ?? null;
    },
    async getTenantBySlug(slug: string) {
      const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug));
      return row ?? null;
    },
    async createUser(input: NewUser): Promise<User> {
      const [row] = await db
        .insert(users)
        .values({
          tenantId: input.tenantId,
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role ?? "owner",
        })
        .returning();
      return row!;
    },
    async getUserByEmail(email: string) {
      const [row] = await db.select().from(users).where(eq(users.email, email));
      return row ?? null;
    },
    async createCamera(tenantId: string, input: NewCamera): Promise<Camera> {
      const [row] = await db
        .insert(cameras)
        .values({
          tenantId,
          name: input.name,
          feedType: input.feedType,
          feedUrl: input.feedUrl,
          feedConfig: input.feedConfig ?? {},
          intervalMinutes: input.intervalMinutes,
          activeFrom: input.activeFrom,
          activeTo: input.activeTo,
          timezone: input.timezone,
          enabled: input.enabled ?? true,
        })
        .returning();
      return row!;
    },
    async getCameraById(id: string) {
      const [row] = await db.select().from(cameras).where(eq(cameras.id, id));
      return row ?? null;
    },
    async listCameras(tenantId: string) {
      return db.select().from(cameras).where(eq(cameras.tenantId, tenantId));
    },
    async updateCamera(id: string, patch: CameraPatch) {
      const [row] = await db.update(cameras).set(patch).where(eq(cameras.id, id)).returning();
      return row ?? null;
    },
    async deleteCamera(id: string) {
      await db.delete(cameras).where(eq(cameras.id, id));
    },
    async listEnabledCameras() {
      return db.select().from(cameras).where(eq(cameras.enabled, true));
    },
    async getPublicCamera(cameraId: string): Promise<PublicCamera | null> {
      const rows = await db
        .select({
          id: cameras.id,
          name: cameras.name,
          theme: cameras.theme,
          retentionMonths: tenants.planMonths,
        })
        .from(cameras)
        .innerJoin(tenants, eq(cameras.tenantId, tenants.id))
        .where(eq(cameras.id, cameraId));
      const row = rows[0];
      return row ? { retentionMonths: row.retentionMonths ?? 12, ...row } : null;
    },
    async insertImage(input: NewImage): Promise<ImageRecord> {
      const [row] = await db.insert(images).values(input).returning();
      return row!;
    },
    async imagesForCameraDay(cameraId: string, from: Date, to: Date) {
      return db
        .select()
        .from(images)
        .where(and(eq(images.cameraId, cameraId), gte(images.timestamp, from), lt(images.timestamp, to)))
        .orderBy(images.timestamp);
    },
    async getImageById(id: string) {
      const [row] = await db.select().from(images).where(eq(images.id, id));
      return row ?? null;
    },
    async latestImageForCamera(cameraId: string) {
      const [row] = await db
        .select()
        .from(images)
        .where(eq(images.cameraId, cameraId))
        .orderBy(images.timestamp, "desc")
        .limit(1);
      return row ?? null;
    },
  };
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck --workspace @ch/db && npm run test --workspace @ch/db`
Expected: PASS.

PG repos verifikujeme na reálné DB v integračním testu (Task 8).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): repository layer with fakes for tests"
```

---

### Task 5: DB storage — MinIO

**Files:**
- Create: `packages/db/src/storage.ts`, `packages/db/test/storage.test.ts`

**Interfaces:**
- Consumes: `@ch/core` (AppConfig).
- Produces: `@ch/db`:
  - `export interface ObjectStorage { put(key: string, data: Buffer): Promise<void>; get(key: string): Promise<Buffer>; keyFor(tenantSlug, cameraId, timestamp: Date): string }`
  - `export function createObjectStorage(cfg: AppConfig): ObjectStorage`
  - `export function keyFor(tenantSlug: string, cameraId: string, timestamp: Date): string` (pure)

- [ ] **Step 1: Write the failing test**

`packages/db/test/storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keyFor } from "../src/storage.js";

describe("keyFor", () => {
  it("builds org/{slug}/{camera}/{YYYY-MM-DD}/{HHMMSS}.jpg (UTC)", () => {
    const ts = new Date("2026-09-18T09:05:03Z");
    expect(keyFor("acme", "cam-1", ts)).toBe("org/acme/cam-1/2026-09-18/090503.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @ch/db`
Expected: FAIL (storage.ts missing).

- [ ] **Step 3: Implement storage**

`packages/db/src/storage.ts`:

```ts
import { Client } from "minio";
import type { AppConfig } from "@ch/core";

export interface ObjectStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export function keyFor(tenantSlug: string, cameraId: string, timestamp: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${timestamp.getUTCFullYear()}-${pad(timestamp.getUTCMonth() + 1)}-${pad(timestamp.getUTCDate())}`;
  const time = `${pad(timestamp.getUTCHours())}${pad(timestamp.getUTCMinutes())}${pad(timestamp.getUTCSeconds())}`;
  return `org/${tenantSlug}/${cameraId}/${date}/${time}.jpg`;
}

export function createObjectStorage(cfg: AppConfig): ObjectStorage {
  const client = new Client({
    endPoint: cfg.minio.endpoint,
    port: cfg.minio.port,
    useSSL: cfg.minio.useSsl,
    accessKey: cfg.minio.accessKey,
    secretKey: cfg.minio.secretKey,
  });

  return {
    async put(key: string, data: Buffer) {
      await client.putObject(cfg.minio.bucket, key, data, data.length, {
        "Content-Type": "image/jpeg",
      });
    },
    async get(key: string): Promise<Buffer> {
      const stream = await client.getObject(cfg.minio.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @ch/db`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck --workspace @ch/db
git add packages/db
git commit -m "feat(db): minio object storage adapter"
```

---

### Task 6: Worker static_url adapter

**Files:**
- Create: `packages/worker/package.json`, `packages/worker/tsconfig.json`, `packages/worker/src/index.ts`, `packages/worker/src/adapters/staticUrl.ts`, `packages/worker/src/adapters/index.ts`, `packages/worker/test/staticUrl.test.ts`, `packages/worker/.gitignore`

**Interfaces:**
- Consumes: `@ch/core` (typy, AppConfig, HttpError).
- Produces: `@ch/worker`:
  - `export async function fetchJpeg(url: string, opts: { timeoutMs: number; maxBytes: number }): Promise<Buffer>`
  - `export function captureBuffer(cam: Camera, cfg: AppConfig): Promise<Buffer>` — v M1 jen static_url; ostatní throw `HttpError(501, ...)`.

- [ ] **Step 1: Write the failing tests**

`packages/worker/package.json`:

```json
{
  "name": "@ch/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "dev": "tsx src/index.ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@ch/core": "*",
    "@ch/db": "*"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^3.0.0"
  }
}
```

`packages/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

`packages/worker/src/adapters/staticUrl.ts`:

```ts
import { HttpError } from "@ch/core";

export interface FetchJpegOptions {
  timeoutMs: number;
  maxBytes: number;
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

export async function fetchJpeg(url: string, opts: FetchJpegOptions): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, "unsupported_scheme", `only http/https allowed, got ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new HttpError(502, "upstream_error", `feed returned HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > opts.maxBytes) {
      throw new HttpError(502, "feed_too_large", `feed exceeded ${opts.maxBytes} bytes`);
    }
    if (buf.length < JPEG_HEADER.length || !buf.subarray(0, 3).equals(JPEG_HEADER)) {
      throw new HttpError(502, "not_jpeg", "feed is not a JPEG image");
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}
```

`packages/worker/test/staticUrl.test.ts`:

```ts
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchJpeg } from "../src/adapters/staticUrl.js";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x00]);

let server: Server;
let baseUrl = "";

beforeEach(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", baseUrl);
    if (url.pathname === "/cam.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(JPG);
    } else if (url.pathname === "/big.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(Buffer.concat([JPG, Buffer.alloc(1000)]));
    } else if (url.pathname === "/text.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
    } else if (url.pathname === "/missing.jpg") {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchJpeg", () => {
  it("fetches a valid JPEG", async () => {
    const buf = await fetchJpeg(`${baseUrl}/cam.jpg`, { timeoutMs: 2000, maxBytes: 1_000_000 });
    expect(buf).toEqual(JPG);
  });

  it("rejects oversized feeds", async () => {
    await expect(
      fetchJpeg(`${baseUrl}/big.jpg`, { timeoutMs: 2000, maxBytes: 5 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects non-JPEG content", async () => {
    await expect(
      fetchJpeg(`${baseUrl}/text.txt`, { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects 404 upstream", async () => {
    await expect(
      fetchJpeg(`${baseUrl}/missing.jpg`, { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects non-http schemes", async () => {
    await expect(
      fetchJpeg("ftp://example.com/cam.jpg", { timeoutMs: 2000, maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
```

`packages/worker/src/adapters/index.ts`:

```ts
import { HttpError, type AppConfig, type Camera } from "@ch/core";
import { fetchJpeg } from "./staticUrl.js";

export async function captureBuffer(cam: Camera, cfg: AppConfig): Promise<Buffer> {
  switch (cam.feedType) {
    case "static_url":
      return fetchJpeg(cam.feedUrl, { timeoutMs: cfg.feed.timeoutMs, maxBytes: cfg.feed.maxBytes });
    default:
      throw new HttpError(501, "not_implemented", `feed type "${cam.feedType}" is not implemented yet`);
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm install && npm run test --workspace @ch/worker`
Expected: FAIL (adapter module missing).

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm run test --workspace @ch/worker`
Expected: PASS (5 tests).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @ch/worker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/worker
git commit -m "feat(worker): static_url jpeg capture adapter"
```

---

### Task 7: Worker scheduler + capture run

**Files:**
- Create: `packages/worker/src/schedule.ts`, `packages/worker/src/captureRun.ts`, `packages/worker/src/index.ts` (update), `packages/worker/test/schedule.test.ts`, `packages/worker/test/captureRun.test.ts`

**Interfaces:**
- Consumes: `@ch/core`, `@ch/db` (Repos, ObjectStorage), `captureBuffer`.
- Produces:
  - `export function minutesInZone(now: Date, timezone: string): number`
  - `export function isInActiveWindow(cam: Camera, now: Date): boolean`
  - `export function isCaptureDue(cam: Camera, now: Date): boolean`
  - `export async function runSchedule(deps: { repos: Repos; storage: ObjectStorage; cfg: AppConfig; now?: Date; log?: (msg: string) => void }): Promise<number>` (vrátí počet zpracovaných kamer)

- [ ] **Step 1: Write the failing tests**

`packages/worker/src/schedule.ts`:

```ts
import type { Camera } from "@ch/core";

export function minutesInZone(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

export function isInActiveWindow(cam: Camera, now: Date): boolean {
  const current = minutesInZone(now, cam.timezone);
  const [fromH, fromM] = cam.activeFrom.split(":").map(Number) as [number, number];
  const [toH, toM] = cam.activeTo.split(":").map(Number) as [number, number];
  const from = fromH * 60 + fromM;
  const to = toH * 60 + toM;
  if (from === to) return true; // celý den
  if (from < to) return current >= from && current < to;
  return current >= from || current < to; // přes půlnoc
}

export function isCaptureDue(cam: Camera, now: Date): boolean {
  if (!cam.enabled) return false;
  if (!isInActiveWindow(cam, now)) return false;
  if (!cam.lastCaptureAt) return true;
  const last = new Date(cam.lastCaptureAt).getTime();
  const intervalMs = cam.intervalMinutes * 60_000;
  return now.getTime() - last >= intervalMs;
}
```

`packages/worker/test/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Camera } from "@ch/core";
import { isCaptureDue, isInActiveWindow, minutesInZone } from "../src/schedule.js";

const baseCam: Camera = {
  id: "c1",
  tenantId: "t1",
  name: "Main",
  feedType: "static_url",
  feedUrl: "https://example.com/cam.jpg",
  feedConfig: {},
  intervalMinutes: 15,
  activeFrom: "00:00",
  activeTo: "23:59",
  timezone: "UTC",
  enabled: true,
  theme: "light",
  lastCaptureAt: null,
  lastError: null,
};

describe("minutesInZone", () => {
  it("converts UTC noon to Prague time", () => {
    const summerNoon = new Date("2026-07-18T12:00:00Z");
    expect(minutesInZone(summerNoon, "Europe/Prague")).toBe(14 * 60);
  });
});

describe("isInActiveWindow", () => {
  it("full day when from == to", () => {
    expect(isInActiveWindow(baseCam, new Date("2026-07-18T03:00:00Z"))).toBe(true);
  });
  it("respects day window", () => {
    const cam = { ...baseCam, activeFrom: "09:00", activeTo: "17:00", timezone: "UTC" };
    expect(isInActiveWindow(cam, new Date("2026-07-18T12:00:00Z"))).toBe(true);
    expect(isInActiveWindow(cam, new Date("2026-07-18T20:00:00Z"))).toBe(false);
  });
  it("handles overnight window", () => {
    const cam = { ...baseCam, activeFrom: "22:00", activeTo: "06:00", timezone: "UTC" };
    expect(isInActiveWindow(cam, new Date("2026-07-18T23:00:00Z"))).toBe(true);
    expect(isInActiveWindow(cam, new Date("2026-07-18T12:00:00Z"))).toBe(false);
  });
});

describe("isCaptureDue", () => {
  it("due when no last capture", () => {
    expect(isCaptureDue(baseCam, new Date("2026-07-18T12:00:00Z"))).toBe(true);
  });
  it("not due within interval", () => {
    const cam = { ...baseCam, lastCaptureAt: "2026-07-18T11:00:00Z" };
    expect(isCaptureDue(cam, new Date("2026-07-18T11:05:00Z"))).toBe(false);
  });
  it("due after interval elapses", () => {
    const cam = { ...baseCam, lastCaptureAt: "2026-07-18T11:00:00Z" };
    expect(isCaptureDue(cam, new Date("2026-07-18T11:15:00Z"))).toBe(true);
  });
  it("disabled camera never due", () => {
    const cam = { ...baseCam, enabled: false };
    expect(isCaptureDue(cam, new Date("2026-07-18T12:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @ch/worker`
Expected: FAIL (schedule.ts missing).

- [ ] **Step 3: Implement capture run**

`packages/worker/src/captureRun.ts`:

```ts
import type { AppConfig, Camera } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { captureBuffer } from "./adapters/index.js";
import { isCaptureDue } from "./schedule.js";

export interface RunScheduleDeps {
  repos: Repos;
  storage: ObjectStorage;
  cfg: AppConfig;
  now?: Date;
  log?: (msg: string) => void;
}

export async function runSchedule(deps: RunScheduleDeps): Promise<number> {
  const { repos, storage, cfg, log = () => {} } = deps;
  const now = deps.now ?? new Date();
  const cameras = await repos.listEnabledCameras();
  const due = cameras.filter((cam) => isCaptureDue(cam, now));
  let processed = 0;

  const batches: Camera[][] = [];
  for (let i = 0; i < due.length; i += cfg.worker.concurrency) {
    batches.push(due.slice(i, i + cfg.worker.concurrency));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (cam) => {
        processed += 1;
        try {
          const jpeg = await captureBuffer(cam, cfg);
          const tenant = await repos.getTenantById(cam.tenantId);
          if (!tenant) throw new Error(`tenant ${cam.tenantId} not found`);
          const storageKey = storage
            .keyFor ??
            ((*: string, camId: string, ts: Date) => `org/${tenant.slug}/${camId}/${ts.toISOString()}`);
          const key =
            typeof storage.keyFor === "function"
              ? (storage as { keyFor: (s: string, c: string, t: Date) => string }).keyFor(tenant.slug, cam.id, now)
              : `${tenant.slug}.${cam.id}.${now.toISOString()}`;
          void storageKey;
          await storage.put(key, jpeg);
          await repos.insertImage({
            cameraId: cam.id,
            timestamp: now,
            storageKey: key,
            sizeBytes: jpeg.length,
          });
          await repos.updateCamera(cam.id, { lastCaptureAt: now.toISOString(), lastError: null });
          log(`captured ${cam.id} ${key}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await repos.updateCamera(cam.id, { lastError: message });
          log(`capture failed ${cam.id}: ${message}`);
        }
      }),
    );
  }
  return processed;
}
```

Review note: captureRun by mělo sjednotit storage klíč — použít čistou funkci `keyFor` z `@ch/db` (storage modul), ne inline logiku. Konečná podoba:

`packages/worker/src/captureRun.ts` (final):

```ts
import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { keyFor } from "@ch/db";
import { captureBuffer } from "./adapters/index.js";
import { isCaptureDue } from "./schedule.js";

export interface RunScheduleDeps {
  repos: Repos;
  storage: ObjectStorage;
  cfg: AppConfig;
  now?: Date;
  log?: (msg: string) => void;
}

export async function runSchedule(deps: RunScheduleDeps): Promise<number> {
  const { repos, storage, cfg, log = () => {} } = deps;
  const now = deps.now ?? new Date();
  const cameras = await repos.listEnabledCameras();
  const due = cameras.filter((cam) => isCaptureDue(cam, now));
  let processed = 0;

  for (let i = 0; i < due.length; i += cfg.worker.concurrency) {
    const batch = due.slice(i, i + cfg.worker.concurrency);
    await Promise.all(
      batch.map(async (cam) => {
        processed += 1;
        try {
          const jpeg = await captureBuffer(cam, cfg);
          const tenant = await repos.getTenantById(cam.tenantId);
          if (!tenant) throw new Error(`tenant ${cam.tenantId} not found`);
          const key = keyFor(tenant.slug, cam.id, now);
          await storage.put(key, jpeg);
          await repos.insertImage({
            cameraId: cam.id,
            timestamp: now,
            storageKey: key,
            sizeBytes: jpeg.length,
          });
          await repos.updateCamera(cam.id, { lastCaptureAt: now.toISOString(), lastError: null });
          log(`captured ${cam.id} ${key}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await repos.updateCamera(cam.id, { lastError: message });
          log(`capture failed ${cam.id}: ${message}`);
        }
      }),
    );
  }
  return processed;
}
```

Note: pro M1 bez retry-backoffu (1× retry spec je minimalizováno); chyby se zapíší do `lastError` a kameru označí worker příště znovu podle intervalu. Detekce výpadků = M2.

`packages/worker/test/captureRun.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppConfig } from "@ch/core";
import { createFakeRepos } from "@ch/db";
import { captureBuffer } from "../src/adapters/index.js";
import { runSchedule } from "../src/captureRun.js";

const cfg: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "x".repeat(32), accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
};

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe("runSchedule", () => {
  it("captures due camera, inserts image and storage key", async () => {
    const { repos, db } = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    const camera = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });

    const storage = {
      put: async (key: string, _data: Buffer) => {
        (storage as { lastKey?: string }).lastKey = key;
      },
      get: async () => JPG,
    };

    const processed = await runSchedule({
      repos,
      storage,
      cfg,
      now: new Date("2026-09-18T09:00:00Z"),
      log: () => {},
    });

    expect(processed).toBe(1);
    expect(db.images).toHaveLength(1);
    expect(db.images[0]).toMatchObject({ cameraId: camera.id, sizeBytes: JPG.length });
    expect(db.cameras[0]!.lastCaptureAt).not.toBeNull();
  });

  it("skips cameras outside active window", async () => {
    const { repos } = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "09:00",
      activeTo: "10:00",
      timezone: "UTC",
    });
    const storage = { put: async () => {}, get: async () => JPG };
    const processed = await runSchedule({
      repos,
      storage,
      cfg,
      now: new Date("2026-09-18T15:00:00Z"),
      log: () => {},
    });
    expect(processed).toBe(0);
  });

  it("records error on failed capture", async () => {
    const { repos, db } = createFakeRepos();
    const tenant = await repos.createTenant({ name: "ACME", slug: "acme" });
    await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "rtsp", // not implemented in M1
      feedUrl: "rtsp://example.com/cam",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const storage = { put: async () => {}, get: async () => JPG };
    await runSchedule({
      repos,
      storage,
      cfg,
      now: new Date("2026-09-18T09:00:00Z"),
      log: () => {},
    });
    expect(db.cameras[0]!.lastError).toContain("not implemented");
  });
});

void captureBuffer;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace @ch/worker`
Expected: PASS (schedule 8 + capture 3).

- [ ] **Step 5: Implement worker entrypoint**

`packages/worker/src/index.ts`:

```ts
import { loadConfig } from "@ch/core";
import { createDb } from "@ch/db";
import { createRepos } from "@ch/db";
import { createObjectStorage } from "@ch/db";
import { runSchedule } from "./captureRun.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);

async function tick() {
  const processed = await runSchedule({ repos, storage, cfg, log: (m) => console.log(m) });
  if (processed > 0) console.log(`tick: captured/attempted ${processed}`);
}

console.log("worker starting");
await tick();
setInterval(tick, cfg.worker.tickMs).unref();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
```

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck --workspace @ch/worker
git add packages/worker
git commit -m "feat(worker): capture scheduler loop"
```

---

### Task 8: API — aplikace, public routes, retence

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/src/index.ts`, `packages/api/src/app.ts`, `packages/api/src/routes/public.ts`, `packages/api/src/plugins/errors.ts`, `packages/api/src/server.ts`, `packages/api/test/helpers.ts`, `packages/api/test/public.test.ts`, `packages/api/.gitignore`
- Modify (integration-db): `packages/db/src/index.ts` re-export `repos` + `storage`

**Interfaces:**
- Consumes: `@ch/core`, `@ch/db`.
- Produces: `@ch/api`:
  - `export function buildApp(deps: { repos: Repos; storage: ObjectStorage; cfg: AppConfig }): FastifyInstance`
  - Public routes:
    - `GET /api/v1/health` → `{ status: "ok" }`
    - `GET /api/v1/cameras/:cameraId` → `PublicCamera`
    - `GET /api/v1/cameras/:cameraId/images?date=YYYY-MM-DD` → `{ images: Array<{ id; timestamp; url }> }`
    - `GET /api/v1/cameras/:cameraId/file/:imageId` → JPEG bytes

- [ ] **Step 1: Write the failing tests**

`packages/api/package.json`:

```json
{
  "name": "@ch/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "dev": "tsx src/server.ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@ch/core": "*",
    "@ch/db": "*",
    "@fastify/cookie": "^11.0.1",
    "@fastify/jwt": "^9.0.2",
    "@fastify/rate-limit": "^10.1.0",
    "@node-rs/argon2": "^2.0.2",
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^3.0.0"
  }
}
```

`packages/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

`packages/api/test/helpers.ts` (sdílený factory pro testy):

```ts
import type { AppConfig } from "@ch/core";
import { createFakeRepos } from "@ch/db";
import type { Repos } from "@ch/db";
import type { ObjectStorage } from "@ch/db";
import { buildApp } from "../src/app.js";

export const testConfig: AppConfig = {
  databaseUrl: "",
  minio: { endpoint: "x", port: 0, useSsl: false, accessKey: "a", secretKey: "b", bucket: "org" },
  jwt: { secret: "test-secret-test-secret", accessTtlSeconds: 900, refreshTtlSeconds: 604800 },
  api: { port: 3000, publicBaseUrl: "http://localhost:8080" },
  worker: { tickMs: 60000, retryBackoffMs: 30000, concurrency: 2 },
  feed: { timeoutMs: 2000, maxBytes: 1_000_000 },
  plan: { defaultRetentionMonths: 12, maxRetentionMonths: 36 },
};

export function makeApp(overrides: { repos?: Repos; storage?: ObjectStorage } = {}) {
  const repos = overrides.repos ?? createFakeRepos();
  const storage: ObjectStorage = overrides.storage ?? {
    put: async () => {},
    get: async (key: string) => Buffer.from(`bytes:${key}`),
  };
  return { app: buildApp({ repos, storage, cfg: testConfig }), repos };
}
```

`packages/api/test/public.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFakeRepos } from "@ch/db";
import { dayRangeUtc, gatedRange, retentionCutoff } from "@ch/core";
import { makeApp, testConfig } from "./helpers.js";

async function seedCamera() {
  const repos = createFakeRepos();
  const tenant = await repos.createTenant({ name: "ACME", slug: "acme", planMonths: 12 });
  const camera = await repos.createCamera(tenant.id, {
    name: "Main",
    feedType: "static_url",
    feedUrl: "https://example.com/cam.jpg",
    intervalMinutes: 15,
    activeFrom: "00:00",
    activeTo: "23:59",
    timezone: "UTC",
  });
  const now = new Date("2026-09-18T12:00:00Z");
  await repos.insertImage({
    cameraId: camera.id,
    timestamp: now,
    storageKey: "org/acme/cam/2026-09-18/120000.jpg",
    sizeBytes: 100,
  });
  return { repos, camera, tenant };
}

describe("public API", () => {
  it("GET /api/v1/health returns ok", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /api/v1/cameras/:id returns public camera", async () => {
    const { repos, camera } = await seedCamera();
    const { app } = makeApp({ repos });
    const res = await app.inject({ method: "GET", url: `/api/v1/cameras/${camera.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: camera.id, name: "Main", retentionMonths: 12 });
  });

  it("returns 404 for unknown camera", async () => {
    const { repos } = await seedCamera();
    const { app } = makeApp({ repos });
    const res = await app.inject({ method: "GET", url: "/api/v1/cameras/00000000-0000-0000-0000-000000000000" });
    expect(res.statusCode).toBe(404);
    expect(res.json().title).toBe("not_found");
  });

  it("GET images?date returns images within retention", async () => {
    const { repos, camera } = await seedCamera();
    const { app } = makeApp({ repos });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/cameras/${camera.id}/images?date=2026-09-18`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.images).toHaveLength(1);
    expect(body.images[0]).toMatchObject({ id: expect.any(String), timestamp: expect.any(String) });
  });

  it("returns empty array for dates before retention cutoff", async () => {
    const { repos } = await seedCamera();
    const camera = repos.db.cameras[0]!;
    const tenant = await repos.getTenantById(camera.tenantId)!;
    const { start, end } = dayRangeUtc("2024-01-01");
    const cutoff = retentionCutoff(tenant!.planMonths, new Date("2026-09-18T12:00:00Z"));
    const gated = gatedRange(start, end, cutoff);
    expect(gated.end.getTime()).toBeLessThanOrEqual(gated.start.getTime());
    const { app } = makeApp({ repos });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/cameras/${camera.id}/images?date=2024-01-01`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().images).toHaveLength(0);
  });

  it("GET file/:imageId returns jpeg bytes", async () => {
    const { repos, camera } = await seedCamera();
    const image = repos.db.images[0]!;
    const { app } = makeApp({ repos, storage: { put: async () => {}, get: async () => Buffer.from([0xff, 0xd8, 0xff]) } });
    const res = await app.inject({ method: "GET", url: `/api/v1/cameras/${camera.id}/file/${image.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.rawPayload).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });
});
```

Note: `repos.db` je dostupný, protože seedCamera tworí fake repos lokálně a my ji předáváme. `repos.db.images` typ: `FakeDb`. Test helpers + type ok.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm install && npm run test --workspace @ch/api`
Expected: FAIL (app.ts missing).

- [ ] **Step 3: Implement app, errors, public routes**

`packages/api/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";
import { registerPublicRoutes } from "./routes/public.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { errorHandler } from "./plugins/errors.js";

export interface AppDeps {
  repos: Repos;
  storage: ObjectStorage;
  cfg: AppConfig;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler(errorHandler);

  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `rate limit exceeded for "${req.url}"`,
    }),
  });

  app.register(cookie);
  app.register(jwt, { secret: deps.cfg.jwt.secret, cookie: { cookieName: "ch_access", signed: false } });

  registerPublicRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerAdminRoutes(app, deps);

  return app;
}
```

Note: admin rate limit 300/min se nastaví v admin routes per-route (Task 9).

`packages/api/src/plugins/errors.ts`:

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { HttpError, rfc7807 } from "@ch/core";

export function errorHandler(err: FastifyError, _req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) {
    reply.status(err.status).send(rfc7807(err.status, err.title, err.detail));
    return;
  }
  if (err.statusCode && err.statusCode < 500) {
    reply.status(err.statusCode).send(rfc7807(err.statusCode, err.name, err.message));
    return;
  }
  reqoss.log.error(err);
  reply.status(500).send(rfc7807(500, "internal_error", "internal server error"));
}
```

(Oprava: `_req.log.error(err)` ne `reqoss`.)

`packages/api/src/routes/public.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { dayRangeUtc, gatedRange, HttpError, retentionCutoff } from "@ch/core";
import type { AppDeps } from "../app.js";

export function registerPublicRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get("/api/v1/health", async () => ({ status: "ok" }));

  app.get("/api/v1/cameras/:cameraId", async (req, reply) => {
    const { cameraId } = req.params as { cameraId: string };
    const pub = await deps.repos.getPublicCamera(cameraId);
    if (!pub) return reply.status(404).send({ type: "about:blank", title: "not_found", status: 404, detail: "camera not found" });
    return pub;
  });

  app.get("/api/v1/cameras/:cameraId/images", async (req, reply) => {
    const { cameraId } = req.params as { cameraId: string };
    const { date } = req.query as { date?: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpError(400, "bad_request", "date must be YYYY-MM-DD");
    }
    const pub = await deps.repos.getPublicCamera(cameraId);
    if (!pub) return reply.status(404).send({ type: "about:blank", title: "not_found", status: 404, detail: "camera not found" });

    const { start, end } = dayRangeUtc(date);
    const cutoff = retentionCutoff(pub.retentionMonths, new Date());
    const gated = gatedRange(start, end, cutoff);

    let images = [];
    if (gated.end.getTime() > gated.start.getTime()) {
      images = await deps.repos.imagesForCameraDay(cameraId, gated.start, gated.end);
    }
    return {
      images: images.map((img) => ({
        id: img.id,
        timestamp: img.timestamp,
        url: `/api/v1/cameras/${cameraId}/file/${img.id}`,
      })),
    };
  });

  app.get("/api/v1/cameras/:cameraId/file/:imageId", async (req, reply) => {
    const { cameraId, imageId } = req.params as { cameraId: string; imageId: string };
    const camera = await deps.repos.getPublicCamera(cameraId);
    if (!camera) throw new HttpError(404, "not_found", "camera not found");
    const image = await deps.repos.getImageById(imageId);
    if (!image || image.cameraId !== cameraId) throw new HttpError(404, "not_found", "image not found");

    const cutoff = retentionCutoff(camera.retentionMonths, new Date());
    if (new Date(image.timestamp).getTime() < cutoff.getTime()) {
      throw new HttpError(404, "not_found", "image outside retention window");
    }

    const buf = await deps.storage.get(image.storageKey);
    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(buf);
  });
}
```

`packages/api/src/server.ts`:

```ts
import { loadConfig } from "@ch/core";
import { createDb, createObjectStorage, createRepos } from "@ch/db";
import { buildApp } from "./app.js";

const cfg = loadConfig(process.env);
const db = createDb(cfg.databaseUrl);
const repos = createRepos(db);
const storage = createObjectStorage(cfg);
const app = buildApp({ repos, storage, cfg });

await app.listen({ port: cfg.api.port, host: "127.0.0.1" });
```

`packages/api/src/index.ts`:

```ts
export { buildApp, type AppDeps } from "./app.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace @ch/api`
Expected: PASS (6 tests).

Note: `errorHandler` volá `req.log` — oprav dokumentaci v kódu: `(_req, ...)` a `req.log.error(err)` — v handleru máme přístup k requestu; uprav signaturu:

```ts
export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) {
    reply.status(err.status).send(rfc7807(err.status, err.title, err.detail));
    return;
  }
  if (err.statusCode && err.statusCode < 500) {
    reply.status(err.statusCode).send(rfc7807(err.statusCode, err.name ?? "error", err.message));
    return;
  }
  req.log.error(err);
  reply.status(500).send(rfc7807(500, "internal_error", "internal server error"));
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck --workspace @ch/api
git add packages/api packages/db
git commit -m "feat(api): public routes with retention gate"
```

(Kvůli re-exportu v db index.ts — review nezapomenout.)

- [ ] **Step 6: Re-export db factory functions**

Modify `packages/db/src/index.ts`:

```ts
export * from "./schema.js";
export * from "./db.js";
export * from "./repos.types.js";
export * from "./repos.js";
export * from "./storage.js";
```

Test po tomto kroku: `npm run test --workspace @ch/api` stále PASS.

---

### Task 9: API — auth (register/login/refresh/logout) + admin camera CRUD

**Files:**
- Create: `packages/api/src/plugins/auth.ts`, `packages/api/src/routes/auth.ts`, `packages/api/src/routes/admin.ts`, `packages/api/test/auth.test.ts`, `packages/api/test/admin.test.ts`
- Modify: `packages/api/src/app.ts` (register refresh cookie name, per-route admin rate limit 300/min)

**Interfaces:**
- Produces:
  - `POST /api/v1/auth/register` `{ name, slug, email, password }` → 201, nastaví cookies
  - `POST /api/v1/auth/login` `{ email, password }` → 200, nastaví cookies
  - `POST /api/v1/auth/refresh` → nové cookies (vyžaduje platný refresh cookie)
  - `POST /api/v1/auth/logout` → smaže cookies
  - Admin (JWT auth, tenant-scoped):
    - `GET/POST /api/v1/admin/cameras`
    - `GET/PUT/DELETE /api/v1/admin/cameras/:id`
    - `GET /api/v1/admin/cameras/:id/preview`

- [ ] **Step 1: Write the failing tests**

`packages/api/src/plugins/auth.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@ch/core";

const ACCESS_COOKIE = "ch_access";
const REFRESH_COOKIE = "ch_refresh";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { tenantId: string; email: string; role: string; kind: "access" | "refresh" };
    user: AuthUser;
  }
}

export function setCookies(reply: FastifyReply, cfg: AppConfig, access: string, refresh: string) {
  const base = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: false };
  reply.setCookie(ACCESS_COOKIE, access, { ...base, maxAge: cfg.jwt.accessTtlSeconds });
  reply.setCookie(REFRESH_COOKIE, refresh, { ...base, maxAge: cfg.jwt.refreshTtlSeconds });
}

export function clearCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: "/" });
}

export function getAccessToken(req: FastifyRequest): string | null {
  const token = req.cookies[ACCESS_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function getRefreshToken(req: FastifyRequest): string | null {
  const token = req.cookies[REFRESH_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function requireAuth(app: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = getAccessToken(req);
    if (!token) return reply.code(401).send({ type: "about:blank", title: "unauthorized", status: 401, detail: "missing access token" });
    try {
      const payload = app.jwt.verify<{ tenantId: string; email: string; role: string; kind: string }>(token);
      if (payload.kind !== "access") throw new Error("not access token");
      req.user = { id: payload.sub ?? "", tenantId: payload.tenantId, email: payload.email, role: payload.role as string };
    } catch {
      return reply.code(401).send({ type: "about:blank", title: "unauthorized", status: 401, detail: "invalid access token" });
    }
  };
}
```

`packages/api/src/routes/auth.ts`:

```ts
import argon2 from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { HttpError } from "@ch/core";
import type { AppDeps } from "../app.js";
import { clearCookies, getRefreshToken, setCookies } from "../plugins/auth.js";

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/auth/register", async (req, reply) => {
    const body = req.body as { name?: string; slug?: string; email?: string; password?: string };
    if (!body.name || !body.slug || !body.email || !body.password) {
      throw new HttpError(400, "bad_request", "name, slug, email and password are required");
    }
    if (!VALID_SLUG.test(body.slug)) throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
    if (body.password.length < 8) throw new HttpError(400, "bad_request", "password must be at least 8 characters");

    const existing = await deps.repos.getTenantBySlug(body.slug);
    if (existing) throw new HttpError(409, "conflict", "tenant slug already taken");

    const passwordHash = await argon2.hash(body.password);
    const tenant = await deps.repos.createTenant({
      name: body.name,
      slug: body.slug,
      planMonths: deps.cfg.plan.defaultRetentionMonths,
    });
    const user = await deps.repos.createUser({
      tenantId: tenant.id,
      email: body.email.toLowerCase(),
      passwordHash,
      role: "owner",
    });

    const access = app.jwt.sign(
      { tenantId: tenant.id, email: user.email, role: user.role, kind: "access" },
      { expiresIn: deps.cfg.jwt.accessTtlSeconds },
    );
    const refresh = app.jwt.sign(
      { tenantId: tenant.id, email: user.email, role: user.role, kind: "refresh" },
      { expiresIn: deps.cfg.jwt.refreshTtlSeconds },
    );
    setCookies(reply, deps.cfg, access, refresh);
    return reply.code(201).send({ status: "created", tenantId: tenant.id });
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const body = req.body as { email?: string; password?: string };
    if (!body.email || !body.password) throw new HttpError(400, "bad_request", "email and password are required");
    const user = await deps.repos.getUserByEmail(body.email.toLowerCase());
    if (!user) throw new HttpError(401, "unauthorized", "invalid credentials");
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) throw new HttpError(401, "unauthorized", "invalid credentials");

    const access = app.jwt.sign(
      { tenantId: user.tenantId, email: user.email, role: user.role, kind: "access" },
      { expiresIn: deps.cfg.jwt.accessTtlSeconds },
    );
    const refresh = app.jwt.sign(
      { tenantId: user.tenantId, email: user.email, role: user.role, kind: "refresh" },
      { expiresIn: deps.cfg.jwt.refreshTtlSeconds },
    );
    setCookies(reply, deps.cfg, access, refresh);
    return { status: "ok" };
  });

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const token = getRefreshToken(req);
    if (!token) throw new HttpError(401, "unauthorized", "missing refresh token");
    let payload;
    try {
      payload = app.jwt.verify<{ tenantId: string; email: string; role: string; kind: string }>(token);
    } catch {
      throw new HttpError(401, "unauthorized", "invalid refresh token");
    }
    if (payload.kind !== "refresh") throw new HttpError(401, "unauthorized", "invalid refresh token");
    const access = app.jwt.sign(
      { tenantId: payload.tenantId, email: payload.email, role: payload.role, kind: "access" },
      { expiresIn: deps.cfg.jwt.accessTtlSeconds },
    );
    reply.setCookie("ch_access", access, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: deps.cfg.jwt.accessTtlSeconds,
    });
    return { status: "ok" };
  });

  app.post("/api/v1/auth/logout", async (_req, reply) => {
    clearCookies(reply);
    return { status: "ok" };
  });
}
```

Note: `req.cookies` vyžaduje @fastify/cookie registraci — je v `app.ts`.

Admin routes `packages/api/src/routes/admin.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { HttpError } from "@ch/core";
import type { AppDeps } from "../app.js";
import { requireAuth } from "../plugins/auth.js";

const FEED_TYPES = ["static_url", "mjpeg", "hls", "rtsp", "custom"];
const INTERVALS = [5, 15, 30, 60];

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps) {
  const pre = requireAuth(app);

  app.get("/api/v1/admin/cameras", { preHandler: pre }, async (req) => {
    const cameras = await deps.repos.listCameras(req.user!.tenantId);
    return { cameras };
  });

  app.post("/api/v1/admin/cameras", { preHandler: pre }, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "";
    const feedType = String(body.feedType ?? "");
    const feedUrl = typeof body.feedUrl === "string" ? body.feedUrl : "";
    const intervalMinutes = Number(body.intervalMinutes ?? "15");

    if (!name) throw new HttpError(400, "bad_request", "name is required");
    if (!FEED_TYPES.includes(feedType)) throw new HttpError(400, "bad_request", `feedType must be one of ${FEED_TYPES.join(", ")}`);
    if (!INTERVALS.includes(intervalMinutes)) throw new HttpError(400, "bad_request", "intervalMinutes must be one of 5, 15, 30, 60");
    if (!feedUrl.startsWith("http://") && !feedUrl.startsWith("https://") && !feedUrl.startsWith("rtsp://")) {
      throw new HttpError(400, "bad_request", "feedUrl must start with http://, https:// or rtsp://");
    }

    const camera = await deps.repos.createCamera(req.user!.tenantId, {
      name,
      feedType: feedType as never,
      feedUrl,
      intervalMinutes,
      activeFrom: String(body.activeFrom ?? "00:00"),
      activeTo: String(body.activeTo ?? "23:59"),
      timezone: String(body.timezone ?? "UTC"),
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    });
    return reply.code(201).send({ camera });
  });

  app.get("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).send({ type: "about:blank", title: "not_found", status: 404, detail: "camera not found" });
    }
    return { camera };
  });

  app.put("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).send({ type: "about:blank", title: "not_found", status: 404, detail: "camera not found" });
    }
    const body = req.body as Record<string, unknown>;
    const patch = Object.fromEntries(
      Object.entries(body).filter(([k]) =>
        ["name", "feedType", "feedUrl", "intervalMinutes", "activeFrom", "activeTo", "timezone", "enabled"].includes(k),
      ),
    );
    const updated = await deps.repos.updateCamera(id, patch as never);
    return { camera: updated };
  });

  app.delete("/api/v1/admin/cameras/:id", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).send({ type: "about:blank", title: "not_found", status: 404, detail: "camera not found" });
    }
    await deps.repos.deleteCamera(id);
    return reply.code(204).send();
  });

  app.get("/api/v1/admin/cameras/:id/preview", { preHandler: pre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const camera = await deps.repos.getCameraById(id);
    if (!camera || camera.tenantId !== req.user!.tenantId) {
      return reply.code(404).send({ type: "about:blank", title: "not_found", status: 404, detail: "camera not found" });
    }
    const latest = await deps.repos.latestImageForCamera(id);
    return { latest: latest ? { id: latest.id, timestamp: latest.timestamp, sizeBytes: latest.sizeBytes } : null };
  });
}
```

`packages/api/test/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFakeRepos } from "@ch/db";
import { makeApp } from "./helpers.js";

describe("auth", () => {
  it("registers tenant and sets cookies", async () => {
    const { app, repos } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(repos.db.tenants).toHaveLength(1);
    expect(repos.db.users).toHaveLength(1);
  });

  it("rejects duplicate slug", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME2", slug: "acme", email: "b@acme.cz", password: "password123" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("login returns cookies, logout clears them", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeDefined();
    const cookies = (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!);
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: cookies.join("; ") },
    });
    expect(logout.statusCode).toBe(200);
  });

  it("login rejects wrong password", async () => {
    const { app } = makeApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@acme.cz", password: "wrong" },
    });
    expect(login.statusCode).toBe(401);
  });
});
```

`packages/api/test/admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createFakeRepos } from "@ch/db";
import { makeApp } from "./helpers.js";

async function registerAndLogin(app: ReturnType<typeof makeApp>["app"]) {
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "ACME", slug: "acme", email: "a@acme.cz", password: "password123" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "a@acme.cz", password: "password123" },
  });
  return (login.headers["set-cookie"] as string[]).map((c) => c.split(";")[0]!).join("; ");
}

describe("admin cameras", () => {
  it("lists cameras for own tenant only", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const other = await repos.createTenant({ name: "Other", slug: "other" });
    await repos.createCamera(other.id, {
      name: "Other cam",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/cameras", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().cameras).toHaveLength(0);
  });

  it("creates a camera", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Main",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().camera).toMatchObject({ id: expect.any(String), feedType: "static_url" });
  });

  it("rejects bad interval", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg", intervalMinutes: 7 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("requires auth", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/cameras" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for camera of another tenant", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const otherTenant = await repos.createTenant({ name: "Other", slug: "other" });
    const cam = await repos.createCamera(otherTenant.id, {
      name: "Other cam",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${cam.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns preview latest image", async () => {
    const { app, repos } = makeApp();
    const cookie = await registerAndLogin(app);
    const tenant = repos.db.tenants[0]!;
    const cam = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://x/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: cam.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: "k",
      sizeBytes: 10,
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/cameras/${cam.id}/preview`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().latest?.timestamp).toBe("2026-09-18T09:00:00.000Z");
  });
});

void randomUUID;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @ch/api`
Expected: FAIL (auth/admin routes modules missing).

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm run test --workspace @ch/api`
Expected: PASS (auth 4 + admin 6).

Note: `@fastify/jwt` cookie option — token access cookie ověřování funguje přes `app.jwt.verify(token)`. Refresh cookie čteno přes `req.cookies`.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck --workspace @ch/api
git add packages/api
git commit -m "feat(api): auth and tenant-scoped admin camera CRUD"
```

---

### Task 10: Web widget (Vite + React)

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/tsconfig.node.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/api.ts`, `packages/web/src/App.css`, `packages/web/src/test/setup.ts`, `packages/web/src/test/App.test.tsx`, `packages/web/.gitignore`

**Interfaces:**
- Consumes: `@ch/api` (public endpointy, sdílené typy přes `@ch/core`).
- Produces: `@ch/web` — build do `dist/`; dev server na 8080.

- [ ] **Step 1: Write the failing test**

`packages/web/package.json`:

```json
{
  "name": "@ch/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 8080",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 8080",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^6.0.3",
    "vitest": "^3.0.0"
  }
}
```

`packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
```

`packages/web/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "composite": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`packages/web/vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: { port: 8080, proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: true } } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

`packages/web/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Camera History</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/web/src/api.ts`:

```ts
export interface PublicCamera {
  id: string;
  name: string;
  theme: string;
  retentionMonths: number;
}

export interface ImageDto {
  id: string;
  timestamp: string;
  url: string;
}

export async function getCamera(cameraId: string): Promise<PublicCamera> {
  const res = await fetch(`/api/v1/cameras/${cameraId}`);
  if (!res.ok) throw new Error(`camera fetch failed: ${res.status}`);
  return res.json();
}

export async function getImages(cameraId: string, date: string): Promise<ImageDto[]> {
  const res = await fetch(`/api/v1/cameras/${cameraId}/images?date=${date}`);
  if (!res.ok) throw new Error(`images fetch failed: ${res.status}`);
  const body: { images: ImageDto[] } = await res.json();
  return body.images;
}
```

`packages/web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`packages/web/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { getCamera, getImages, type ImageDto } from "./api";
import "./App.css";

function parseWidgetPath(path: string): { tenant: string; cameraId: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "widget" && parts.length === 3) {
    return { tenant: parts[1]! as string, cameraId: parts[2]! };
  }
  return null;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function App() {
  const route = useMemo(() => parseWidgetPath(window.location.pathname), []);
  const [camera, setCamera] = useState<{ name: string; retentionMonths: number } | null>(null);
  const [images, setImages] = useState<ImageDto[]>([]);
  const [date, setDate] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("date") ?? toLocalInputValue(new Date());
  });
  const [openImage, setOpenImage] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("hour") ?? null;
  });
  const [modalUrl, setModalUrl] = useState<string>("");

  const cameraId = route?.cameraId ?? "";

  const minDate = camera
    ? toLocalInputValue(new Date(Date.now() - camera.retentionMonths * 30 * 24 * 3600 * 1000))
    : "";

  useEffect(() => {
    if (!cameraId) return;
    getCamera(cameraId).then((c) => setCamera(c));
  }, [cameraId]);

  useEffect(() => {
    if (!cameraId) return;
    getImages(cameraId, date)
      .then(setImages)
      .catch(() => setImages([]));
  }, [cameraId, date]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(toLocalInputValue(d));
  };

  const buildShareUrl = (img: ImageDto) => {
    const hour = new Date(img.timestamp).getHours();
    const p = new URLSearchParams({ date, hour: String(hour) });
    return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
  };

  return (
    <div className="widget" data-testid="widget">
      <div className="widget-header">
        <span className="widget-title">{camera?.name ?? "Camera"}</span>
        <div className="widget-nav">
          <button onClick={() => shiftDay(-1)} aria-label="Previous day">{"<"}</button>
          <input
            type="date"
            value={date}
            min={minDate || undefined}
            max={toLocalInputValue(new Date())}
            onChange={(e) => setDate(e.target.value || date)}
          />
          <button onClick={() => shiftDay(1)} aria-label="Next day">{">"}</button>
        </div>
      </div>
      <div className="widget-grid" data-testid="image-grid">
        {images.length === 0 && <p className="empty">Žádné snímky pro toto datum.</p>}
        {images.map((img) => (
          <button
            key={img.id}
            className="widget-cell"
            data-testid={`image-${img.id}`}
            onClick={() => setOpenImage(openImage === img.id ? null : img.id)}
          >
            <img src={img.url} alt={img.timestamp} loading="lazy" />
            <span>{new Date(img.timestamp).toLocaleTimeString()}</span>
          </button>
        ))}
      </div>
      {openImage && (
        <div className="modal" data-testid="share-modal" onClick={() => setOpenImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpenImage(null)}>×</button>
            <img
              src={`/api/v1/cameras/${cameraId}/file/${openImage}`}
              alt="selected"
              data-testid="modal-image"
            />
            {images.find((i) => i.id === openImage) && (
              <div className="modal-actions">
                <button
                  onClick={() => {
                    const img = images.find((i) => i.id === openImage)!;
                    navigator.clipboard?.writeText(buildShareUrl(img));
                    setModalUrl(buildShareUrl(img));
                  }}
                >
                  Copy link
                </button>
                <span className="share-url">{modalUrl}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {!route && <p className="error">Invalid widget URL. Use /widget/{"{tenant}"}/{"{camera_id}"}</p>}
    </div>
  );
}
```

`packages/web/src/App.css` (minimální, neutrální):

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #fff; color: #111; }
.widget { max-width: 1000px; margin: 0 auto; padding: 16px; }
.widget-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.widget-nav { display: flex; gap: 8px; align-items: center; }
.widget-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.widget-cell { border: 1px solid #ddd; border-radius: 6px; overflow: hidden; background: #fff; cursor: pointer; padding: 0; position: relative; }
.widget-cell img { width: 100%; display: block; height: 90px; object-fit: cover; }
.widget-cell span { display: block; font-size: 12px; padding: 4px 8px; color: #555; }
.empty, .error { color: #888; text-align: center; padding: 24px; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal-content { background: #fff; padding: 16px; border-radius: 8px; max-width: 90vw; max-height: 90vh; overflow: auto; position: relative; }
.modal-content img { display: block; max-width: 100%; }
.modal-close { position: absolute; top: 4px; right: 4px; }
.modal-actions { margin-top: 8px; display: flex; gap: 8px; align-items: center; }
.share-url { font-size: 12px; color: #666; word-break: break-all; }
```

`packages/web/src/test/App.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";

vi.mock("../api", () => ({
  getCamera: vi.fn(async () => ({ id: "cam-1", name: "Pláž", theme: "light", retentionMonths: 12 })),
  getImages: vi.fn(async () => [
    { id: "img-1", timestamp: "2026-09-18T09:00:00Z", url: "/api/v1/cameras/cam-1/file/img-1" },
    { id: "img-2", timestamp: "2026-09-18T12:00:00Z", url: "/api/v1/cameras/cam-1/file/img-2" },
  ]),
}));

beforeEach(() => {
  window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18");
});

describe("App widget", () => {
  it("renders camera name and images", async () => {
    render(<App />);
    expect(await screen.findByText("Pláž")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId(/^image-/)).toHaveLength(2));
  });

  it("opens modal on image click and copies share link", async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = await screen.findByTestId("image-img-1");
    await user.click(first);
    expect(await screen.findByTestId("share-modal")).toBeInTheDocument();
    const copy = screen.getByText("Copy link");
    await user.click(copy);
    expect(screen.getByText(/date=2026-09-18/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install && npm run test --workspace @ch/web`
Expected: FAIL (App/api missing).

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test --workspace @ch/web`
Expected: PASS (2 tests).

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck --workspace @ch/web && npm run build --workspace @ch/web`
Expected: PASS, `dist/` vytvořeno.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): public embed widget"
```

---

### Task 11: docker-compose (dev infra) + .env

**Files:**
- Create: `docker-compose.yml`, `.env.example` (již od Task 1 — ověřit), `packages/api/Dockerfile`, `packages/worker/Dockerfile`, `packages/web/Dockerfile`

**Interfaces:**
- Produces: `docker compose up -d postgres minio` spustí dev DB + storage; aplikace zodpovědné Dockerfily připravené pro nasazení (produkční nginx dle spec zajišťuje hostitelský nginx).

- [ ] **Step 1: Write docker-compose**

`docker-compose.yml`:

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
      test: ["CMD-SHELL", "pg_isready -U camera"]
      interval: 2s
      timeout: 2s
      retries: 20

  minio:
    image: minio/minio:RELEASE.2024-12-18T13-15-44Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

(Pozn. produkční deploy per spec: api/web/worker zůstávají na 127.0.0.1 bez veřejných portů; postgres/minio nepublikované vůbec. Toto compose je dev-only.)

- [ ] **Step 2: Dockerfiles (production-ready, multi-stage)**

`packages/api/Dockerfile`:

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
COPY --from=build /app/packages/api/dist packages/api/dist
EXPOSE 3000
CMD ["node", "packages/api/dist/server.js"]
```

`packages/worker/Dockerfile` (obdoba, CMD `node packages/worker/dist/index.js`).

`packages/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/web packages/web
RUN npm install --workspace @ch/web
RUN npm run build --workspace @ch/web

FROM nginx:1.27-alpine
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Verify compose config**

Run: `docker compose config -q`
Expected: PASS (no error).

- [ ] **Step 4: Start infra + verify**

Run: `docker compose up -d postgres minio`
Then: `npm run db:migrate --workspace @ch/db`
Expected: "migrations applied".

Then Run: `docker compose ps`
Expected: postgres healthy, minio running.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml packages/api/Dockerfile packages/worker/Dockerfile packages/web/Dockerfile
git commit -m "infra: dev docker-compose and production dockerfiles"
```

---

### Task 12: E2E smoke (Playwright) + integrace DB run

**Files:**
- Create: `packages/web/playwright.config.ts`, `packages/web/e2e/widget.spec.ts`, `packages/api/test/integration/db.integration.test.ts`, `packages/api/package.json` (přidat playwright devDep + script)

**Interfaces:**
- Produces: E2E widget (auto-start API s fakerepos via vite proxy mock), integrační test PG (gated `RUN_INTEGRATION=1`).

- [ ] **Step 1: Write the E2E test and config**

`packages/web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:8080" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: true,
  },
});
```

`packages/web/e2e/widget.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const CAMERA = { id: "cam-1", name: "Pláž", theme: "light", retentionMonths: 12 };
const IMAGES = {
  images: [
    { id: "img-1", timestamp: "2026-09-18T09:00:00Z", url: "/api/v1/cameras/cam-1/file/img-1" },
    { id: "img-2", timestamp: "2026-09-18T12:00:00Z", url: "/api/v1/cameras/cam-1/file/img-2" },
  ],
};

test("widget loads images and opens modal", async ({ page }) => {
  await page.route("**/api/v1/cameras/cam-1", (route) => route.fulfill({ json: CAMERA }));
  await page.route("**/api/v1/cameras/cam-1/images?*", (route) => route.fulfill({ json: IMAGES }));
  await page.route("**/api/v1/cameras/cam-1/file/*", (route) => route.fulfill({ body: Buffer.from([0xff, 0xd8, 0xff]), headers: { "content-type": "image/jpeg" } }));

  await page.goto("/widget/acme/cam-1?date=2026-09-18");
  await expect(page.getByText("Pláž")).toBeVisible();
  await expect(page.getByTestId("image-img-1")).toBeVisible();
  await page.getByTestId("image-img-1").click();
  await expect(page.getByTestId("share-modal")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E (mock API)**

Add to `packages/web/package.json` devDeps: `"@playwright/test": "^1.49.1"`, script `"e2e": "playwright test"`.

Run: `npm install && npm run e2e --workspace @ch/web`
Expected: PASS (1 test; API server není potřeba, vše mockováno via page.route).

- [ ] **Step 3: Write DB integration test (opt-in)**

`packages/api/test/integration/db.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "@ch/core";
import { createDb, createRepos } from "@ch/db";

const RUN = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!RUN)("PG integration", () => {
  it("creates tenant, camera, image and queries within day", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "IT", slug: `it-${Date.now()}` });
    const user = await repos.createUser({
      tenantId: tenant.id,
      email: `it-${tenant.id}@test.dev`,
      passwordHash: "x",
    });
    const cam = await repos.createCamera(tenant.id, {
      name: "Main",
      feedType: "static_url",
      feedUrl: "https://example.com/cam.jpg",
      intervalMinutes: 15,
      activeFrom: "00:00",
      activeTo: "23:59",
      timezone: "UTC",
    });
    const img = await repos.insertImage({
      cameraId: cam.id,
      timestamp: new Date("2026-09-18T09:00:00Z"),
      storageKey: "org/it/cam/2026-09-18/090000.jpg",
      sizeBytes: 3,
    });
    const rows = await repos.imagesForCameraDay(cam.id, new Date("2026-09-18T00:00:00Z"), new Date("2026-09-19T00:00:00Z"));
    expect(rows.map((r) => r.id)).toContain(img.id);
    expect(user.email).toContain("@test.dev");

    await db.delete(cameras).where(eq(cameras.id, cam.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    const pool = (db.$client as import("pg").Pool);
    await pool.end();
  });
});
```

(Přidej importy `cameras, users, tenants, eq` na začátek souboru.)

Run: `npm run test --workspace @ch/api` (bez RUN_INTEGRATION) → integrace přeskočena, PASS.
Run s DB: `RUN_INTEGRATION=1 npm run test --workspace @ch/api` → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web packages/api
git commit -m "test: e2e widget smoke + optional PG integration test"
```

---

### Task 13: Final verification + README embed dokumentace

**Files:**
- Modify: `README.md` (section Embed + deploy), zadní kontrola root skriptů

- [ ] **Step 1: Run all checks**

Run:
```bash
npm run typecheck
npm run test
npm run db:generate --workspace @ch/db
npm run build
```
Expected: všechny PASS; build vytvoří dist pro core/db/api/worker/web.

Lint: `npx eslint packages --ext .ts,.tsx`
Oprav případná upozornění na `any`/použití `as`.

- [ ] **Step 2: Update README**

Doplň do `README.md` sekci Embed widgetu (již od Task 1) + odkaz na design doc, dev porty, zapnutí DB.

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: embed and deployment notes"
```

- [ ] **Step 4: Verify git state clean**

Run: `git status`
Expected: working tree clean (na branch `main`).