# Widget Filmstrip + Daylight Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the embedded widget as a faithful port of legacy Box.js (day filmstrip, in-place expand + scrub, social share popup, `?date=&hour=` deep links, date nav below) and add a day/night layer: `isDaylight` computed by the API from camera coordinates, a widget „Night images" toggle, and optional `daylight_only` capture in the worker.

**Architecture:** Sun math lives once in `@ch/core` (`sunTimes`, NOAA approximation). Camera gains `latitude`/`longitude`/`daylightOnly` (migration `0004`). The public images endpoint computes `isDaylight` per image (coordinates → precise sunrise/sunset; no coordinates or polar → fixed local window 20:00–06:00). The worker's `isCaptureDue` respects `daylightOnly`. The widget is rebuilt (filmstrip + popup + toggle) with no new dependencies (reads `isDaylight` from the API).

**Tech Stack:** TypeScript, drizzle (migration 0004), Fastify, React 18 + Vite (widget), Vitest, Playwright (visual QA).

Spec: `docs/superpowers/specs/2026-10-18-camera-history-widget-filmstrip-design.md`

## Global Constraints

- **Widget neutral**: no brand fonts in `@ch/web` (system stack only); 4 themes (`light/dark/forest/midnight`) preserved via `data-theme`.
- **Legacy semantics binding**: hour param and chip times are VIEWER-LOCAL (`new Date(ts).getHours()`), like `legacy/src/Box.js`; `?date=YYYY-MM-DD&hour=H` opens that capture expanded; `?img=<id>` (older links) still honored.
- **Fallback definition** (no coords / polar null): `isDaylight = localHour in camera tz ∈ [6, 20)`.
- **Pinned copy/testids** that survive: `No images for this date.`; area testids `widget`, `image-grid` may be replaced by the filmstrip equivalents per this plan (tests are rewritten accordingly — that is sanctioned by the spec).
- English only. Gates green: `npm run typecheck && npm test && npm run lint && npm run build`.
- Do not commit `dist/`, `node_modules/`, `.env`, `docker-compose.override.yml`.
- Migration flow: `npm run db:generate` → `packages/db/drizzle/0004_*.sql`; the api container applies it at startup.

---

### Task 1: Core sun math + types + schema/migration

**Files:**
- Create: `packages/core/src/sun.ts`, `packages/core/test/sun.test.ts`
- Modify: `packages/core/src/types.ts` (Camera, NewCamera/UpdateCamera equivalents, PublicCamera)
- Modify: `packages/db/src/schema.ts` (cameras columns), generate `packages/db/drizzle/0004_*.sql`
- Modify: `packages/db/src/repos.ts`, `packages/db/src/testing/fakeRepos.ts` (row mapping incl. new fields)
- Modify: `packages/db/src/repos.types.ts` (public camera shape if separate)

**Interfaces:**
- Produces (used by Tasks 2–5):
  - `sunTimes(dateLocal: string, lat: number, lon: number): { sunrise: Date; sunset: Date } | null` (UTC instants; `null` when polar / invalid).
  - `Camera` + `latitude: number | null`, `longitude: number | null`, `daylightOnly: boolean`.
  - `PublicCamera` + `latitude: number | null`, `longitude: number | null`.

- [ ] **Step 1: Write failing core tests** `packages/core/test/sun.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { sunTimes } from "../src/sun.js";

const min = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

describe("sunTimes", () => {
  it("Prague summer solstice", () => {
    const t = sunTimes("2026-06-21", 50.08, 14.42)!;
    expect(t).not.toBeNull();
    // ~04:53 CEST sunrise / ~21:11 CEST sunset (UTC 02:53 / 19:11), tolerance ±6 min
    expect(Math.abs(min(t.sunrise) - (2 * 60 + 53))).toBeLessThanOrEqual(6);
    expect(Math.abs(min(t.sunset) - (19 * 60 + 11))).toBeLessThanOrEqual(6);
  });
  it("Prague winter solstice", () => {
    const t = sunTimes("2026-12-21", 50.08, 14.42)!;
    // ~07:58 CET / ~16:03 CET (UTC 06:58 / 15:03), ±6 min
    expect(Math.abs(min(t.sunrise) - (6 * 60 + 58))).toBeLessThanOrEqual(6);
    expect(Math.abs(min(t.sunset) - (15 * 60 + 3))).toBeLessThanOrEqual(6);
  });
  it("Lake Louise mid-October (west longitude)", () => {
    const t = sunTimes("2026-10-18", 51.425, -116.177)!;
    // ~08:00 MDT / ~18:40 MDT (UTC 14:00 / 00:40+1d), ±8 min
    const sunsetMin = min(t.sunset) + (t.sunset.getUTCDate() !== t.sunrise.getUTCDate() ? 1440 : 0);
    expect(Math.abs(min(t.sunrise) - 14 * 60)).toBeLessThanOrEqual(8);
    expect(Math.abs(sunsetMin - (24 * 60 + 40))).toBeLessThanOrEqual(8);
  });
  it("equator is ~06:00/18:00 all year", () => {
    const t = sunTimes("2026-03-21", 0, 0)!;
    expect(Math.abs(min(t.sunrise) - 6 * 60)).toBeLessThanOrEqual(10);
    expect(Math.abs(min(t.sunset) - 18 * 60)).toBeLessThanOrEqual(10);
  });
  it("polar midsummer returns null (Tromsø)", () => {
    expect(sunTimes("2026-06-21", 69.65, 18.96)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run packages/core/test/sun.test.ts` (module missing).

- [ ] **Step 3: Implement `packages/core/src/sun.ts`**

```ts
const RAD = Math.PI / 180;

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/**
 * Sunrise/sunset (UTC instants) for a local calendar date at lat/lon.
 * NOAA/Spencer approximation; returns null for polar day/night or invalid input.
 */
export function sunTimes(dateLocal: string, lat: number, lon: number): SunTimes | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLocal);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const base = Date.UTC(y, mo - 1, d);
  const dayN = Math.floor((base - Date.UTC(y, 0, 0)) / 86_400_000); // 1..366
  const g = (2 * Math.PI / 365) * (dayN - 1);
  const cos = Math.cos;
  const sin = Math.sin;
  const eqtime =
    229.18 *
    (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g) - 0.014615 * cos(2 * g) - 0.040849 * sin(2 * g));
  const decl =
    0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g) - 0.006758 * cos(2 * g) +
    0.000907 * sin(2 * g) - 0.002697 * cos(3 * g) + 0.00148 * sin(3 * g);

  const zenith = 90.833 * RAD;
  const cosHa = cos(zenith) / (cos(lat * RAD) * cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null; // polar day/night

  const ha = Math.acos(cosHa) / RAD; // degrees
  const solarNoon = 720 - 4 * lon - eqtime; // minutes past UTC midnight
  return {
    sunrise: new Date(base + (solarNoon - 4 * ha) * 60_000),
    sunset: new Date(base + (solarNoon + 4 * ha) * 60_000),
  };
}

export function localDateInZone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
```

Export both from `packages/core/src/index.ts` (verify the existing export pattern and add).

- [ ] **Step 4: Types** — in `packages/core/src/types.ts`: add to `Camera`:

```ts
  latitude: number | null;
  longitude: number | null;
  daylightOnly: boolean;
```
And to `PublicCamera`:
```ts
  latitude: number | null;
  longitude: number | null;
```
Mirror on any create/update input types used by repos (`NewCamera`-like) as optional (`latitude?: number | null` etc.). Grep `NewCamera`/`UpdateCamera` in `packages/core/src/types.ts` and `packages/db` and extend coherently.

- [ ] **Step 5: Schema + migration** — in `packages/db/src/schema.ts` cameras table add:

```ts
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  daylightOnly: boolean("daylight_only").notNull().default(false),
```
(import `doublePrecision` from `drizzle-orm/pg-core` if not present). Run `npm run db:generate` → new `packages/db/drizzle/0004_*.sql`; inspect it contains the three ALTERs; commit it.

- [ ] **Step 6: Repos real+fake** — update row→Camera mapping in `packages/db/src/repos.ts` (createCamera insert fields, updateCamera set fields incl. nullable assignment, getPublicCamera selects coords) and mirror in `packages/db/src/testing/fakeRepos.ts`. Keep defaults: absent input → `latitude: null, longitude: null, daylightOnly: false`.

- [ ] **Step 7: Verify** — `npx vitest run packages/core/test/ packages/db/test/ packages/api/test/integration/db.integration.test.ts` (integration gated; run with `RUN_INTEGRATION=1 DATABASE_URL=postgres://camera:bf16d93362b919ef189d1be5d0ba0f7f97c4fd3e82f72bb5@127.0.0.1:15432/camera_history`) → PASS; `npm run typecheck` → 0.

- [ ] **Step 8: Commit** `feat(core,db): sun times, camera coordinates and daylight-only column`

---

### Task 2: API — `isDaylight` on images + admin validation

**Files:**
- Modify: `packages/api/src/routes/public.ts`, `packages/api/src/routes/admin.ts`
- Modify: `packages/api/test/public.test.ts`, `packages/api/test/admin.test.ts`

**Interfaces:**
- Consumes: `sunTimes` (Task 1), camera lat/lon via `getPublicCamera`.
- Produces (used by Task 4): images response items `{ id, timestamp, url, isDaylight: boolean }`.

- [ ] **Step 1: Tests first (public).** Add to `packages/api/test/public.test.ts`:
  - camera WITH coords (e.g. lat 51.425, lon −116.177): an image at `2026-10-18T20:00:00Z` (≈14:00 MDT, daylight) → `isDaylight: true`; an image at `2026-10-18T06:00:00Z` (≈00:00 MDT, night) → `false`.
  - camera WITHOUT coords (timezone `UTC`): `2026-10-18T10:00:00Z` → true; `2026-10-18T22:00:00Z` → false; `2026-10-18T20:00:00Z` → false (boundary `[6,20)`).
  - polar camera (lat 69.65, date 2026-06-21) → fallback window behavior (10:00Z true, 22:00Z false).
  - Assert `isDaylight` is present on every item and other fields unchanged.

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run packages/api/test/public.test.ts`.

- [ ] **Step 3: Implement in `public.ts`** — in the images handler, after fetching `data`:

```ts
import { dayRangeUtc, gatedRange, retentionCutoff, rfc7807, sunTimes, localHour } from "@ch/core";
```
(If no `localHour` helper exists in core, add `localHourInZone(ts: Date, tz: string): number` next to `localDateInZone` in `sun.ts` and export it.)

```ts
  const times = cam.latitude !== null && cam.longitude !== null
    ? sunTimes(date, cam.latitude, cam.longitude)
    : null;

  const isDaylightAt = (ts: Date): boolean => {
    if (times) return ts >= times.sunrise && ts <= times.sunset;
    const h = localHourInZone(ts, cam.timezone); // fallback window
    return h >= 6 && h < 20;
  };
```
and map items with `isDaylight: isDaylightAt(img.timestamp)`.

- [ ] **Step 4: Admin tests.** Add to `packages/api/test/admin.test.ts`:
  - POST camera with `latitude: 51.425, longitude: -116.177, daylightOnly: true` → 201, GET shows the values.
  - POST `daylightOnly: true` WITHOUT coords → 400 `bad_request`.
  - POST `latitude: 100` → 400; `longitude: -200` → 400; non-number `latitude: "x"` → 400.
  - PUT enabling `daylightOnly` on an existing camera that has NO coords → 400; on one WITH coords → 200.

- [ ] **Step 5: Implement admin validation** — in POST/PUT camera handlers validate the MERGED state:
```ts
const num = (v: unknown): number | null | "invalid" =>
  v === null || v === undefined ? null : typeof v === "number" && Number.isFinite(v) ? v : "invalid";
// latitude: null | number | "invalid" ... range checks -90..90 / -180..180 → 400 bad_request
// after merge: if (daylightOnly) require latitude !== null && longitude !== null → 400
//   "latitude and longitude are required when daylightOnly is enabled"
```
Accept the three fields in the allowed-input list; keep every existing validation/test intact.

- [ ] **Step 6: Verify** — `npx vitest run packages/api/test/` → PASS; `npm run typecheck` → 0.

- [ ] **Step 7: Commit** `feat(api): daylight flag on images and camera coordinate validation`

---

### Task 3: Worker — daylight-only capture window

**Files:**
- Modify: `packages/worker/src/schedule.ts`, `packages/worker/test/schedule.test.ts`

**Interfaces:**
- Consumes: `sunTimes`, `localDateInZone` (Task 1).
- Produces: `isCaptureDue` behavior used by `captureRun`.

- [ ] **Step 1: Tests first** (`schedule.test.ts`), using a camera fixture with `daylightOnly: true, latitude: 51.425, longitude: -116.177, timezone: "America/Edmonton"`:
  - `now` inside [sunrise, sunset] for its local date → active; outside → not active (assert via `isCaptureDue` with fresh `lastCaptureAt` — or export and test `isInDaylightWindow` directly).
  - `daylightOnly: true` but NO coords → falls back to `activeFrom/activeTo` behavior (window ignored toggle, i.e. behaves as if daylightOnly false).
  - polar date (Tromsø 69.65, 2026-06-21) → `sunTimes` null → fallback to `activeFrom/activeTo`.
  - `daylightOnly: false` → unchanged active-window behavior.

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run packages/worker/test/schedule.test.ts`.

- [ ] **Step 3: Implement** in `schedule.ts`:

```ts
import { localDateInZone, sunTimes, type Camera } from "@ch/core";

export function isInDaylightWindow(cam: Camera, now: Date): boolean | null {
  if (!cam.daylightOnly || cam.latitude === null || cam.longitude === null) return null;
  const t = sunTimes(localDateInZone(now, cam.timezone), cam.latitude, cam.longitude);
  if (!t) return null; // polar → let caller fall back
  return now >= t.sunrise && now <= t.sunset;
}
```
and in `isCaptureDue`:
```ts
  const daylight = isInDaylightWindow(cam, now);
  if (daylight !== null ? !daylight : !isInActiveWindow(cam, now)) return false;
```
(`isInActiveWindow` stays exported and unchanged for backward use.)

- [ ] **Step 4: Verify** — `npx vitest run packages/worker/test/` PASS; `npm run typecheck` 0.

- [ ] **Step 5: Commit** `feat(worker): capture only during daylight when configured`

---

### Task 4: Widget rebuild — filmstrip, expand/scrub, share popup, night toggle

**Files:**
- Modify: `packages/web/src/api.ts` (ImageDto + `isDaylight: boolean`)
- Rewrite: `packages/web/src/App.tsx`; Create: `packages/web/src/FilmStrip.tsx`, `packages/web/src/SharePopup.tsx`
- Modify: `packages/web/src/App.css`
- Rewrite tests: `packages/web/src/test/App.test.tsx` (+ optional `FilmStrip.test.tsx`)

**Interfaces:**
- Consumes: images items with `isDaylight` (Task 2); existing group API (`getGroup`, `getCameraLatest`, fallback/keep-date logic preserved).
- Produces: embeddable widget at `/widget/...` and `/group/...` with the legacy UX.

Binding behavior:
- **Filmstrip:** `data-testid="film-strip"` flex row; per image `button data-testid="frame-<id>"`, `flex:1`, background `cover` center, OSD hour chip (viewer-local `3 PM` style); >28 frames → `min-width:14px; overflow-x:auto`.
- **Night toggle:** `data-testid="night-toggle"` switch in header, label `Night images`, default OFF → filter `images.filter(i => i.isDaylight)`; when filtering leaves the day empty but images exist → message `Every capture today is a night shot.` + `Show night images` button (`data-testid="show-night"`).
- **Expand:** clicking a frame → `data-testid="frame-open"` (`flex: 1 1 97%`), image `object-fit: contain` on dark, overlay ‹ › buttons (`Previous capture`/`Next capture`) moving through the FILTERED list, full OSD chip (`October 18, 2026 · 3 PM`), share button (`data-testid="share-open"`), collapse by clicking the backdrop or the active frame.
- **Share popup:** `data-testid="share-popup"`; title = same full local date+time; 4 network buttons (Facebook `https://www.facebook.com/sharer/sharer.php?u=`, X `https://twitter.com/intent/tweet?text=`, WhatsApp `https://wa.me/?text=`, Telegram `https://t.me/share/url?url=`) each `target="_blank" rel="noopener"` + `aria-label`; copy row: readonly input with URL + `Copy` button → `Copied` (2s); overlay click and `Esc` close; close button `data-testid="share-close"`.
- **Share URL / deep links:** build `?date=<date>&hour=<viewer-local hour>`; on load, `?hour` opens that capture expanded (first image whose `new Date(ts).getHours() === hour`), `?img=<id>` opens by id (higher precedence would break hour links — give `img` precedence only when `hour` is absent); changing the day clears `hour`.
- **Date nav below the strip:** `data-testid="date-nav"` with `<button aria-label="Previous day">`, `input[type=date]` (min = retention, max = today), `<button aria-label="Next day">`; URL sync via `history.replaceState` (`?date=`, deletes `hour`).
- **States:** loading → 8 skeleton slivers `data-testid="film-skeleton"`; empty day → `No images for this date.`; group route keeps switcher + keep-date + latest fallback logic from the current implementation (do not regress those tests' intents — rewrite them against filmstrip markup).
- **Themes/neutral:** keep the `data-theme` system and per-theme CSS variables built in the signage task; no new deps in `packages/web/package.json`.

- [ ] **Step 1: Rewrite tests first** (`App.test.tsx`) covering: filmstrip renders N frames; hour chip text; expand → frame-open + arrows move through filtered list; share popup opens with correct URL (`date` + `hour` of the opened capture) and `Copied` after copy click (stub clipboard); night toggle filters (`isDaylight:false` frames hidden; `show-night` path when all filtered); deep link `?date&hour` opens expanded; `?img` opens expanded; date nav calls `getImages` with the new date and clears hour; loading skeleton; empty-state copy; group keep-date/fallback still work. Use the existing `vi.mock("../api")` pattern plus `getGroup`/`getCameraLatest`.
- [ ] **Step 2: Run to verify FAIL** — `npx vitest run packages/web/src/test/App.test.tsx`.
- [ ] **Step 3: Implement** `api.ts` (`isDaylight`), `FilmStrip.tsx`, `SharePopup.tsx`, `App.tsx` wiring, `App.css` (filmstrip, expand, popup, toggle, skeletons, themes). Keep components small; no logic regressions in group mode.
- [ ] **Step 4: Run to verify PASS** — `npx vitest run packages/web/src/test/App.test.tsx`.
- [ ] **Step 5: Verify** — `npm run typecheck --workspace @ch/web && npm run build --workspace @ch/web && npx eslint packages/web` → 0; `npm run test` (repo) green.
- [ ] **Step 6: Commit** `feat(web): rebuild widget as legacy filmstrip with night toggle and share popup`

---

### Task 5: Admin UI — location & schedule fields

**Files:**
- Modify: `packages/admin/src/api.ts` (CameraInput + `latitude/longitude/daylightOnly`), `packages/admin/src/App.tsx` (CameraForm + toInput + payload), tests additive.

- [ ] **Step 1: Tests first** (append to `App.test.tsx`): opening the form shows `form-latitude`, `form-longitude` inputs and `form-daylight-only` checkbox; saving a camera with lat/lon + checkbox posts them (assert POST body); checking daylight without coords shows inline validation error and does not submit.
- [ ] **Step 2: Implement** — number inputs (step 0.001, empty = null), checkbox with hints; client validation (ranges; daylight requires coords); extend `CameraInput`, `toInput`, and the create/edit payload; keep all existing testids and copy intact.
- [ ] **Step 3: Verify** — `npx vitest run packages/admin/src/test/` PASS; typecheck/build/eslint 0; `npm run test` green.
- [ ] **Step 4: Commit** `feat(admin): camera location fields and daylight-only toggle`

---

### Task 6: Seeder update + deploy + production e2e + visual QA

**Files:**
- Modify: `scripts/seed-demo.mjs` (intervals 60, coordinates, update-if-changed for existing cameras)

- [ ] **Step 1: Seeder changes** — Alpine cameras: `intervalMinutes: 60, latitude: 51.425, longitude: -116.177`; Kite Cam: `intervalMinutes: 60, latitude: 53.35, longitude: -6.267`; `daylightOnly` stays false. Add an update pass: `GET /admin/cameras` → for configs whose `intervalMinutes`/coords differ → `PUT /admin/cameras/:id` with the full camera input (name/feed/interval/active/theme/timezone + coords + daylightOnly:false); log `~ <name> (updated)`. Keep idempotency (re-run = 0 created/0 updated).
- [ ] **Step 2: Deploy API + worker** (migration 0004):
  `docker compose build api worker` (build may take ~10 min — run detached with `setsid`, poll the log; never `pkill -f` patterns that match your own shell) → `docker compose up -d api worker` → api logs show `migrations applied`; health 200.
- [ ] **Step 3: Deploy UIs**: `npm run build` (root; site/web/admin dist are served by host nginx directly).
- [ ] **Step 4: Run the seeder** — `node scripts/seed-demo.mjs`; verify re-run is idempotent (0 created, 0 updated after the first update pass).
- [ ] **Step 5: Production e2e**
  - `GET /api/v1/cameras/<id>/images?date=` → items include `isDaylight` (assert one true and (if present) one false).
  - Deep link: `/group/alpine-summit/summit?date=<d>&hour=<h>` renders with that capture expanded (Playwright screenshot).
  - Toggle: night hidden by default; `show-night` path when applicable.
  - Gates: `npm run typecheck && npm test && npm run lint && npm run build` → 0.
- [ ] **Step 6: Visual QA screenshots (controller reads them)** — widget light+midnight: day strip, expanded frame with share popup, night toggle on, mobile width (~380px iframe); deck/landing unaffected (smoke 200).
- [ ] **Step 7: Commit** `feat(demo): hourly captures with coordinates and seeder updates`

---

## Self-Review

- **Spec coverage:** §3 model/migration → T1; §4 sun math → T1; §5 API `isDaylight` + validation → T2; §6 worker → T3; §7 admin UI → T5; §8 widget UX (strip/expand/share/toggle/deep links/date nav/states/themes/a11y) → T4; §9 seeder → T6; §10 testing/QA → every task + T6; §11 risks documented in spec; §12 respected.
- **Placeholder scan:** no TBD/TODO; binding code given for `sunTimes`, API flagging, worker window, DTO/testid/copy contracts; the widget is spec-by-behavior with exact testids/copy (the redesign's freedom is bounded by them + the rewritten tests).
- **Type consistency:** `isDaylight` name, `frame-<id>`/`frame-open`/`film-strip`/`night-toggle`/`show-night`/`share-popup`/`date-nav` testids, `sunTimes(dateLocal, lat, lon)`, `localDateInZone`, `isInDaylightWindow`, `daylightOnly`, `latitude/longitude` used identically across tasks.
