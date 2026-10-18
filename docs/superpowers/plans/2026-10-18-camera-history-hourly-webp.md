# Hourly alignment + WebP pipeline + night default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make captures land exactly on interval boundaries (hourly for the demo), store every capture as WebP 1600px q75 (≈80–200 KB), hard-purge all off-hour captures across tenants, convert all remaining images to WebP, and add a per-camera admin switch that decides whether the widget shows night images by default.

**Architecture:** New camera column `show_night` (migration 0005) exposed through public/admin DTOs and consumed by the widget as the night-toggle default. The worker converts every captured buffer with ffmpeg/libwebp before storage and switches `isCaptureDue` to interval-bucket alignment. The API file route serves `.webp` (and legacy `.jpg`). Two idempotent ops scripts (`scripts/purge-offhour.mjs`, `scripts/convert-webp.mjs`) perform the destructive cleanup and backfill against Postgres + MinIO using the root `.env`.

Spec: `docs/superpowers/specs/2026-10-18-camera-history-hourly-webp-design.md`

## Global Constraints

- English only in UI/test copy; widget stays neutral (system fonts, 4 themes).
- WebP settings verbatim: max width **1600 px** (`scale='min(1600,iw)':-2`), libwebp **quality 75**.
- Purge scope: **all tenants/cameras**, `EXTRACT(MINUTE FROM timestamp) <> 0`, hard delete (MinIO object + DB row).
- Conversion: every remaining `.jpg` → `.webp` (same path, new extension), update `storage_key`, delete the original object.
- Migrations via `npm run db:generate` → `packages/db/drizzle/0005_*.sql`; api container applies on startup.
- Gates green: `npm run typecheck && npm test && npm run lint && npm run build`.
- Never commit `.env`, `dist/`, `node_modules/`, `docker-compose.override.yml`.
- Deterministic ops: scripts are idempotent and support `--dry-run`; real runs happen only after the new worker is deployed.

---

### Task 1: `show_night` across data layer

**Files:**
- Modify: `packages/core/src/types.ts` (`Camera`, `PublicCamera`, `PublicGroupCamera`, create/update input types)
- Modify: `packages/db/src/schema.ts` + generate `packages/db/drizzle/0005_*.sql`
- Modify: `packages/db/src/repos.ts`, `packages/db/src/testing/fakeRepos.ts`, `packages/db/src/repos.types.ts` (if needed)
- Modify: `packages/api/test/integration/db.integration.test.ts` (additive)

**Interfaces:**
- Produces: `Camera.showNight: boolean`, `PublicCamera.showNight: boolean`, `PublicGroupCamera.showNight: boolean` (default false); `createCamera`/`updateCamera` accept optional `showNight`.

- [ ] **Step 1:** Add types (defaults false; optional in inputs). Add schema column:
```ts
  showNight: boolean("show_night").notNull().default(false),
```
  Run `npm run db:generate`; inspect `0005_*.sql` = single ALTER ADD COLUMN NOT NULL DEFAULT false; confirm snapshot chain.
- [ ] **Step 2:** Map the column in real repo row→Camera, insert/update, `getPublicCamera`, and `getGroupBySlug` (each camera DTO gains `showNight`); mirror in `fakeRepos` (defaults false, respect provided value).
- [ ] **Step 3:** Additive integration test: create camera with `showNight: true` → read back true; default false; group resolve exposes per-camera `showNight`.
- [ ] **Step 4:** Verify: `npx vitest run packages/core/test/ packages/db/test/`; integration with `RUN_INTEGRATION=1 DATABASE_URL=…@127.0.0.1:15432/camera_history`; `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(core,db): show-night camera setting`.

---

### Task 2: Worker — WebP conversion + bucket alignment

**Files:**
- Create: `packages/worker/src/imageConvert.ts`, `packages/worker/test/imageConvert.test.ts`
- Modify: `packages/worker/src/captureRun.ts`, `packages/worker/src/schedule.ts`, `packages/worker/test/schedule.test.ts`

**Interfaces:**
- Produces: `toWebp(input: Buffer): Promise<Buffer>`; all stored captures use `.webp` keys; `isCaptureDue` = bucket-aligned.

- [ ] **Step 1: `imageConvert.ts`**
```ts
import { spawn } from "node:child_process";

export const WEBP_ARGS = [
  "-hide_banner", "-loglevel", "error",
  "-i", "pipe:0",
  "-vf", "scale='min(1600,iw)':-2",
  "-c:v", "libwebp", "-quality", "75",
  "-f", "webp", "pipe:1",
];

export function toWebp(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", WEBP_ARGS);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`ffmpeg webp failed (${code}): ${Buffer.concat(err).toString().slice(0, 500)}`)),
    );
    proc.stdin.end(input);
  });
}
```
- [ ] **Step 2: Test** `imageConvert.test.ts` — `describe.skipIf(!ffmpegAvailable)`: generate a 2000×1000 JPEG with ffmpeg (`testsrc`), run `toWebp`, assert output magic `RIFF`…`WEBP` (`out.subarray(0,4).toString() === "RIFF"`, `out.subarray(8,12).toString() === "WEBP"`), assert output length < input length. (`ffmpegAvailable` via `spawnSync("ffmpeg", ["-version"]).status === 0`.)
- [ ] **Step 3: captureRun integration** — after `captureWithRetry` returns the JPEG buffer, `const webp = await toWebp(jpeg)` and store with the `.webp` storage key (`…/${HHMMSS}.webp`); update any type/mock (`captureBuffer` still returns JPEG). Keep retry/error semantics (conversion error = capture error).
- [ ] **Step 4: bucket alignment** in `schedule.ts`:
```ts
  const intervalMs = cam.intervalMinutes * 60_000;
  const bucketStart = Math.floor(now.getTime() / intervalMs) * intervalMs;
  if (!cam.lastCaptureAt) return true;
  return cam.lastCaptureAt.getTime() < bucketStart;
```
  (replaces the `now - last >= interval` check; window/daylight checks unchanged). Update tests: due on first tick after boundary; NOT due again in the same bucket; not due before boundary; 5/15/30/60 alignment; daylight window interplay; no lastCapture → due.
- [ ] **Step 5:** Verify `npx vitest run packages/worker/test/`, typecheck/eslint; commit `feat(worker): webp capture pipeline and interval-aligned scheduling`.

---

### Task 3: API — WebP file route + `showNight` validation

**Files:**
- Modify: `packages/api/src/routes/public.ts`, `packages/api/src/routes/admin.ts`
- Modify: `packages/api/test/public.test.ts`, `packages/api/test/admin.test.ts`

- [ ] **Step 1:** `fileRe = /^\d{6}\.(webp|jpg)$/`; content type by extension (`image/webp` / `image/jpeg`). Tests: a `.webp` file serves 200 with `image/webp`; legacy `.jpg` still serves `image/jpeg`; bad extension still 404.
- [ ] **Step 2:** Admin POST/PUT accept `showNight` with the same strict-boolean validation as `daylightOnly` (`HttpError(400,"bad_request","showNight must be a boolean")`); merged-state not needed (no coupling). Tests: create with `showNight: true` → 201 + GET true; string `"false"` → 400.
- [ ] **Step 3:** Public DTOs already include `showNight` from Task 1 (assert in tests: `/api/v1/cameras/:id` and group resolve expose it).
- [ ] **Step 4:** Verify api tests + typecheck; commit `feat(api): webp file route and show-night validation`.

---

### Task 4: Admin UI — “Show night images by default”

**Files:**
- Modify: `packages/admin/src/api.ts`, `packages/admin/src/App.tsx`, `packages/admin/src/test/App.test.tsx`

- [ ] **Step 1:** `CameraInput`/`AdminCamera` + `emptyInput`/`toInput` + payload: `showNight: boolean`.
- [ ] **Step 2:** In the „Location & schedule” section add checkbox `data-testid="form-show-night"` label `Show night images by default`, hint `Viewers can still toggle night images in the widget.`
- [ ] **Step 3:** Tests: form renders the checkbox; creating with it checked sends `showNight: true`; editing prefills it; payload includes false when unchecked.
- [ ] **Step 4:** Verify admin tests + typecheck/build/eslint; commit `feat(admin): per-camera night images default`.

---

### Task 5: Widget — night toggle defaults from the camera

**Files:**
- Modify: `packages/web/src/api.ts` (camera/group DTO types), `packages/web/src/App.tsx`, `packages/web/src/test/App.test.tsx`

- [ ] **Step 1:** Types: single camera meta gains `showNight: boolean`; group camera DTO gains `showNight: boolean`.
- [ ] **Step 2:** `nightOn` initialization/sync: when the selected camera's meta is known (single route) or the selected group camera is known (group route), set `nightOn = showNight`; re-sync when the selected camera changes; a viewer's manual toggle persists until the camera/date changes (date change must NOT reset the toggle).
- [ ] **Step 3:** Tests: single camera with `showNight: true` → toggle on at load and night frames visible; `false` → off; group: switching to a camera with `showNight: true` turns the toggle on / with false turns it off; manual toggle survives a date change.
- [ ] **Step 4:** Verify web tests + typecheck/build/eslint; commit `feat(web): night toggle defaults from camera setting`.

---

### Task 6: Ops scripts + deploy + purge + conversion + QA

**Files:**
- Create: `scripts/purge-offhour.mjs`, `scripts/convert-webp.mjs`

**Interfaces:** both read root `.env` (`DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`); idempotent; `--dry-run`.

- [ ] **Step 1: `scripts/purge-offhour.mjs`** (full code)
```js
#!/usr/bin/env node
// Hard-delete every image whose capture minute is not :00 (DB row + MinIO object).
// Usage: node scripts/purge-offhour.mjs [--dry-run]
import { readFileSync } from "node:fs";
import { Client as Pg } from "pg";
import { Client as Minio } from "minio";

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const dry = process.argv.includes("--dry-run");
const db = new Pg({ connectionString: env.DATABASE_URL });
await db.connect();

const { rows } = await db.query(
  "SELECT id, storage_key FROM images WHERE EXTRACT(MINUTE FROM timestamp) <> 0 ORDER BY timestamp",
);
console.log(`off-hour images: ${rows.length}`);
if (rows.length > 0) console.log("sample:", rows.slice(0, 5).map((r) => r.storage_key).join(", "));

if (!dry && rows.length > 0) {
  const minio = new Minio({
    endPoint: env.MINIO_ENDPOINT,
    port: Number(env.MINIO_PORT ?? "9000"),
    useSSL: env.MINIO_USE_SSL === "true",
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
  let objects = 0;
  for (const row of rows) {
    try {
      await minio.removeObject(env.MINIO_BUCKET, row.storage_key);
      objects += 1;
    } catch (error) {
      console.warn(`warn: remove ${row.storage_key}: ${error.message}`);
    }
  }
  await db.query("DELETE FROM images WHERE EXTRACT(MINUTE FROM timestamp) <> 0");
  const { rows: left } = await db.query(
    "SELECT count(*)::int AS n FROM images WHERE EXTRACT(MINUTE FROM timestamp) <> 0",
  );
  console.log(`removed ${objects} objects, rows deleted; remaining off-hour: ${left[0].n}`);
}
if (dry) console.log("dry run — nothing deleted");
await db.end();
```
- [ ] **Step 2: `scripts/convert-webp.mjs`** (full code)
```js
#!/usr/bin/env node
// Convert every remaining .jpg image to WebP (max 1600px, q75), update storage_key, delete originals.
// Usage: node scripts/convert-webp.mjs [--dry-run]
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client as Pg } from "pg";
import { Client as Minio } from "minio";

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const dry = process.argv.includes("--dry-run");
const db = new Pg({ connectionString: env.DATABASE_URL });
await db.connect();
const minio = new Minio({
  endPoint: env.MINIO_ENDPOINT,
  port: Number(env.MINIO_PORT ?? "9000"),
  useSSL: env.MINIO_USE_SSL === "true",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const { rows } = await db.query(
  "SELECT id, storage_key, size_bytes FROM images WHERE storage_key LIKE '%.jpg' ORDER BY timestamp",
);
console.log(`jpg images to convert: ${rows.length}`);
if (dry) {
  console.log("dry run — nothing converted");
  await db.end();
  process.exit(0);
}

async function getBuffer(key) {
  const stream = await minio.getObject(env.MINIO_BUCKET, key);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

let done = 0;
let before = 0;
let after = 0;
for (const row of rows) {
  const input = await getBuffer(row.storage_key);
  const inPath = join(tmpdir(), `conv-${row.id}.jpg`);
  const outPath = join(tmpdir(), `conv-${row.id}.webp`);
  writeFileSync(inPath, input);
  const res = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inPath,
    "-vf", "scale='min(1600,iw)':-2",
    "-c:v", "libwebp", "-quality", "75",
    "-f", "webp", outPath,
  ]);
  if (res.status !== 0) {
    console.warn(`warn: ffmpeg failed for ${row.storage_key}: ${String(res.stderr).slice(0, 200)}`);
    unlinkSync(inPath);
    continue;
  }
  const output = readFileSync(outPath);
  const newKey = row.storage_key.replace(/\.jpg$/, ".webp");
  await minio.putObject(env.MINIO_BUCKET, newKey, output, output.length, { "Content-Type": "image/webp" });
  await db.query("UPDATE images SET storage_key = $1, size_bytes = $2 WHERE id = $3", [newKey, output.length, row.id]);
  try { await minio.removeObject(env.MINIO_BUCKET, row.storage_key); } catch {}
  before += input.length;
  after += output.length;
  done += 1;
  unlinkSync(inPath);
  unlinkSync(outPath);
  if (done % 25 === 0) console.log(`… ${done}/${rows.length}`);
}
console.log(`converted ${done}/${rows.length} · ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
const { rows: left } = await db.query("SELECT count(*)::int AS n FROM images WHERE storage_key LIKE '%.jpg'");
console.log(`remaining jpg: ${left[0].n}`);
await db.end();
```
- [ ] **Step 3:** Verify scripts: `node --check` both; `node scripts/purge-offhour.mjs --dry-run` and `node scripts/convert-webp.mjs --dry-run` (read-only counts). Commit `feat(scripts): purge off-hour captures and convert images to webp`.
- [ ] **Step 4 (controller ops, after review):**
  1. Check worker image webp support: `docker compose exec worker sh -c 'ffmpeg -encoders | grep -i webp'` (if missing, add `apk add --no-cache ffmpeg` already present — verify; if libwebp absent, fall back to `-c:v webp`/`libwebp_anim`).
  2. Deploy: `docker compose build api worker` (detached, log file) → `docker compose up -d api worker`; api logs `migrations applied`; health 200.
  3. Build UIs: `npm run build` (root).
  4. Run `node scripts/purge-offhour.mjs`; then `node scripts/convert-webp.mjs`.
  5. Verify: no off-hour rows; no `.jpg` keys; widget strip = one frame per hour; night toggle shows hourly night frames (admin can flip the camera default); image bytes ≈80–200 KB (`curl -sI` on a frame); strip total weight down sharply.
  6. Gates: `npm run typecheck && npm test && npm run lint && npm run build`.
  7. Visual QA screenshots (controller): day strip, night on, admin checkbox, mobile width.

---

## Self-Review

- **Spec coverage:** §3 data → T1; §4.1 webp → T2 (+ route T3); §4.2 alignment → T2; §5 API → T3; §6 admin → T4; §7 widget → T5; §8 scripts → T6; §9 deploy/verification → T6; §10 risks covered (worker ffmpeg check, dry-runs, ordering).
- **Placeholder scan:** scripts are complete code; API/worker/data contracts exact; no TBD.
- **Type consistency:** `showNight` naming across core/db/api/admin/web; `.webp` key naming; `toWebp` signature; bucket formula; env names match `.env`/`.env.example` (`MINIO_*`, `DATABASE_URL`).
