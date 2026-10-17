# Camera History — GTM Fáze 1: Real-feed capture & functional fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the demo's real public-webcam capture work end-to-end (the kitesport WebSocket feed), and fix the functional bugs found during recon, so the live demo actually shows real archived images.

**Architecture:** The worker container is built on `node:20-alpine`, which has no global `WebSocket`; the `custom` adapter also wrongly assumes every WS frame is a raw binary JPEG, while the real kitesport feed sends `data:image/jpg;base64,...` text frames. Fix by (a) moving the worker image to `node:22-alpine` (global `WebSocket` is stable), (b) teaching the adapter to decode base64 data-URL text frames, and (c) fixing the widget's broken `?hour=` share deep-link to key off the image id. Verified by capturing the real feed in the container and serving the image through the public API.

**Tech Stack:** TypeScript, Node 22 (worker runtime), Fastify (API), Vitest (unit tests), Playwright (web e2e), Docker / docker-compose, MinIO, Postgres 16.

## Global Constraints

- Worker runtime base image AFTER this plan: `node:22-alpine` (both build and runtime stages). Do not introduce `--experimental-websocket`.
- No new runtime npm dependencies for the adapter fix (use built-in `Buffer`).
- All user-facing and marketing copy is English (spec-wide). This plan only touches the widget share param, no new copy.
- Commit style: conventional commits, e.g. `fix(worker): ...`, `fix(web): ...`, `chore(ops): ...`. Work inline on `main` (established for this repo).
- Do NOT commit `docker-compose.override.yml` or any file under `/tmp`. The override used for local recon is temporary and lives in `/tmp/opencode/ch-override.yml`.
- Cross-package builds: before running dependent tests, `@ch/core` and `@ch/db` must be built (`npm run build --workspace @ch/core --workspace @ch/db`). Not needed for the tasks below (no `@ch/core`/`@ch/db` changes), listed only as orientation.
- Gates before any task is "done": `npm run typecheck`, `npm test` (or the package-scoped variants), `npm run lint`.

---

## File Structure

- `packages/worker/Dockerfile` — worker image; change base image to Node 22 (fixes `WebSocket is not defined`).
- `packages/worker/package.json` — add `engines.node` to document the runtime floor.
- `packages/worker/src/adapters/custom.ts` — WS frame normalization (raw JPEG bytes OR base64 data-URL text → JPEG `Buffer`).
- `packages/worker/test/custom.test.ts` — extend `FakeWS` to emit string frames; add data-URL and global-`WebSocket` tests.
- `packages/web/src/App.tsx` — share deep-link keyed by image id (fix `?hour=` never matching `img.id`).
- `packages/web/src/test/App.test.tsx` — add deep-link test; extend share test.

No files are deleted. No API/DB changes.

---

### Task 1: Worker image on Node 22 (global `WebSocket` available)

**Files:**
- Modify: `packages/worker/Dockerfile`
- Modify: `packages/worker/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a worker image whose runtime has a global `WebSocket` constructor (`function`), required by Task 2 in production.

- [ ] **Step 1: Change both worker stages to Node 22**

Edit `packages/worker/Dockerfile`. Replace every `FROM node:20-alpine` with `FROM node:22-alpine`. After the edit the file must read:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/worker packages/worker
RUN npm install --workspace @ch/core --workspace @ch/db --workspace @ch/worker
RUN npm run build --workspace @ch/core --workspace @ch/db --workspace @ch/worker

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/package.json packages/db/package.json
COPY --from=build /app/packages/worker/dist packages/worker/dist
COPY --from=build /app/package.json ./
CMD ["node", "packages/worker/dist/index.js"]
```

- [ ] **Step 2: Document the Node floor**

In `packages/worker/package.json`, add an `engines` field at the top level (sibling of `name`/`version`):

```json
"engines": { "node": ">=22" },
```

- [ ] **Step 3: Build the worker image**

Run: `docker build -f packages/worker/Dockerfile -t ch-worker:node22 .`
Expected: build succeeds (exit 0).

- [ ] **Step 4: Verify the global exists in the image**

Run: `docker run --rm --entrypoint node ch-worker:node22 -e "console.log(typeof WebSocket)"`
Expected output: `function`

- [ ] **Step 5: Commit**

```bash
git add packages/worker/Dockerfile packages/worker/package.json
git commit -m "fix(worker): run on node 22 for global WebSocket"
```

---

### Task 2: `custom` adapter decodes base64 data-URL WS frames

**Files:**
- Modify: `packages/worker/test/custom.test.ts`
- Modify: `packages/worker/src/adapters/custom.ts`

**Interfaces:**
- Consumes: `captureCustom(url: string, opts: CustomCaptureOptions): Promise<Buffer>` where `CustomCaptureOptions = { timeoutMs: number; maxBytes: number; WebSocketCtor?: typeof WebSocket }` (existing).
- Produces: same signature; new behavior — a WS text frame of the form `data:<mime>;base64,<payload>` is decoded to the JPEG `Buffer`; a raw binary JPEG frame still resolves; a non-JPEG frame still rejects with status 502.

- [ ] **Step 1: Extend the fake WS and add failing tests**

In `packages/worker/test/custom.test.ts`, change the `FakeWS.frame` signature to accept a string and add the tests below.

Replace:

```ts
  frame(data: ArrayBuffer) {
    this.onmessage?.({ data });
  }
```

with:

```ts
  frame(data: ArrayBuffer | string) {
    this.onmessage?.({ data } as { data: ArrayBuffer });
  }
```

Add these two tests inside the existing `describe("captureCustom", ...)` block:

```ts
  it("decodes a base64 data-URL text frame", async () => {
    const p = captureCustom("wss://cam/x", { timeoutMs: 1000, maxBytes: 1_000_000, WebSocketCtor: ctor });
    const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
    ws.frame(`data:image/jpg;base64,${JPG.toString("base64")}`);
    await expect(p).resolves.toEqual(JPG);
  });

  it("uses the global WebSocket when no ctor is injected", async () => {
    const prev = globalThis.WebSocket;
    globalThis.WebSocket = ctor as unknown as typeof WebSocket;
    try {
      const p = captureCustom("wss://cam/x", { timeoutMs: 1000, maxBytes: 1_000_000 });
      const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
      ws.frame(`data:image/jpeg;base64,${JPG.toString("base64")}`);
      await expect(p).resolves.toEqual(JPG);
    } finally {
      globalThis.WebSocket = prev;
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @ch/worker -- custom.test.ts`
Expected: FAIL — the data-URL tests reject with status 502 (`not_jpeg`).

- [ ] **Step 3: Implement frame normalization**

In `packages/worker/src/adapters/custom.ts`, add a helper above `captureCustom`:

```ts
const DATA_URL_BASE64 = /^data:[^;,]*;base64,(.*)$/s;

function frameToBuffer(data: unknown): Buffer {
  if (typeof data === "string") {
    const m = DATA_URL_BASE64.exec(data);
    if (m) return Buffer.from(m[1] ?? "", "base64");
    return Buffer.from(data, "utf8");
  }
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(String(data), "utf8");
}
```

Then replace the body of `ws.onmessage` that computes `buf` — change:

```ts
      const data = ev.data;
      const buf = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(String(data), "utf8");
```

to:

```ts
      const buf = frameToBuffer(ev.data);
```

Leave the `maxBytes`, JPEG-header, and resolve/reject logic unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @ch/worker -- custom.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck --workspace @ch/worker && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/worker/src/adapters/custom.ts packages/worker/test/custom.test.ts
git commit -m "fix(worker): decode base64 data-URL websocket frames"
```

---

### Task 3: Widget share deep-link keyed by image id

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/test/App.test.tsx`

**Interfaces:**
- Consumes: `ImageDto = { id: string; timestamp: string; url: string }` (existing, `packages/web/src/api.ts`).
- Produces: share URLs carry the image id as `?img=<id>`; on load, `?img=<id>` opens the matching image's modal. (Previously `?hour=<0-23>` was written but compared against `img.id`, so it never matched.)

- [ ] **Step 1: Add the failing deep-link test**

In `packages/web/src/test/App.test.tsx`, add this test inside `describe("App widget", ...)`:

```tsx
  it("opens the shared image from an ?img deep link", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&img=img-2");
    render(<App />);
    expect(await screen.findByTestId("share-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-image")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @ch/web`
Expected: FAIL — no `share-modal` is rendered from `?img=img-2`.

- [ ] **Step 3: Switch the share param to the image id**

In `packages/web/src/App.tsx`, change the `openImage` initializer (currently reads `hour`):

```tsx
  const [openImage, setOpenImage] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("img") ?? null;
  });
```

And change `buildShareUrl` (currently computes `hour` from the timestamp):

```tsx
  const buildShareUrl = (img: ImageDto) => {
    const p = new URLSearchParams({ date, img: img.id });
    p.set("theme", theme);
    return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
  };
```

The existing `const openImg = openImage ? images.find((i) => i.id === openImage) : undefined;` now matches correctly — do not change it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace @ch/web`
Expected: PASS (new deep-link test plus the existing widget tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck --workspace @ch/web && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/test/App.test.tsx
git commit -m "fix(web): share deep-link opens the selected image"
```

---

### Task 4: End-to-end verification on the real kitesport feed

**Files:**
- No source changes (verification only). Optional: append a short note to `README.md` if a step was missing.

**Interfaces:**
- Consumes: the rebuilt worker image (Task 1), the fixed adapter (Task 2), the fixed widget (Task 3).
- Produces: a served real JPEG from the live feed, confirming the demo pipeline.

- [ ] **Step 1: Rebuild and restart the stack on alternate ports**

On a shared host ports 5432/8080 may be taken. Use the temporary override (already at `/tmp/opencode/ch-override.yml`):

```bash
cd /home/ubuntu/camera-history
docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml build worker
docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml up -d
```

Wait for health: `docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml ps`
Expected: `postgres`, `minio`, `api`, `web` all `healthy`; `worker` `Up`. The override also sets `NODE_OPTIONS=--experimental-websocket` for the worker; with the node 22 image this is unnecessary but harmless. Remove the `worker.environment.NODE_OPTIONS` entry from the override once the node 22 image is confirmed so the verification exercises the real default path.

- [ ] **Step 2: Register a tenant and create the real camera**

```bash
cd /tmp/opencode && rm -f cj.txt
curl -s -c cj.txt -X POST http://127.0.0.1:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Demo Resort","slug":"demo-resort","email":"owner@demo.test","password":"demopassword"}'
curl -s -b cj.txt -X POST http://127.0.0.1:3000/api/v1/admin/cameras \
  -H 'content-type: application/json' \
  -d '{"name":"Kite Beach","feedType":"custom","feedUrl":"wss://cam.kitesportcentre.com/gl-cam","intervalMinutes":5,"theme":"light"}'
```

Expected: `201` with a camera `id` (capture the `id` as `<CAMERA_ID>`). If the tenant already exists (409), log in instead with `POST /api/v1/auth/login`.

- [ ] **Step 3: Wait for a capture and confirm no error**

```bash
docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml logs worker --since 120s 2>&1 | grep -v MODULE_TYPELESS | grep -v Reparsing | grep -v 'node --trace'
```

Expected: `tick: captured/attempted 1` with NO `capture failed` line. Then:

```bash
curl -s -b cj.txt http://127.0.0.1:3000/api/v1/admin/cameras/<CAMERA_ID> | grep -o '"lastError":[^,]*'
```

Expected: `"lastError":null`.

- [ ] **Step 4: Confirm the image is archivable via the public API**

```bash
curl -s "http://127.0.0.1:3000/api/v1/cameras/<CAMERA_ID>/images?date=$(date -u +%F)"
```

Expected: JSON containing at least one image with a `url`. Then fetch that `url` (replace the public base with `http://127.0.0.1:3000`) and assert it is a real JPEG:

```bash
curl -s -o /tmp/opencode/cap.jpg -w "%{http_code} %{content_type}\n" "<IMAGE_URL>"
file /tmp/opencode/cap.jpg
```

Expected: `200 image/jpeg` and `JPEG image data`.

- [ ] **Step 5: Teardown**

```bash
docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml down
```

Expected: containers stopped and removed; `docker compose ... ps` empty. Volumes may stay (no `-v`).

- [ ] **Step 6: Commit (only if README changed)**

```bash
git add README.md
git commit -m "docs: note real websocket feed verification"
```

---

## Self-Review

**1. Spec coverage (Fáze 1 = "rozjetí stacku + oprava funkčních chyb"):**
- Real public webcam capture: covered by Tasks 1, 2, 4. Recon proved two concrete blockers (`WebSocket is not defined`; `not_jpeg`).
- Functional bug from recon: widget share deep-link — Task 3.
- Recon findings recorded here: Node 20 vs global WebSocket; kitesport feed is base64 data-URL text; test suite blind spot (injected fake WS only); no admin registration UI; UI partially Czech; host port conflicts (5432/8080). The admin registration UI and the Czech→English copy belong to **Fáze 2** (demo experience), not this plan — tracked for the Fáze 2 plan.

**2. Placeholder scan:** No "TBD"/"implement later". Every code step shows the exact code; every command has expected output.

**3. Type consistency:** `captureCustom` signature unchanged; `frameToBuffer` returns `Buffer`; `FakeWS.frame` widened to `ArrayBuffer | string`; share param renamed consistently (`img`) in both the initializer and `buildShareUrl`; `openImg` lookup unchanged and now correct.

---

## Notes for the next plan (Fáze 2)

Fáze 2 (demo experience) is a separate subsystem and gets its own plan. Known items surfaced by this recon:
- Admin has no registration UI (`packages/admin/src/App.tsx` only renders `Login`; API `POST /api/v1/auth/register` works).
- Admin UI is Czech; widget has one Czech empty-state string (`packages/web/src/App.tsx:105`). Spec requires English.
- Demo tenant seed + hybrid history backfill (archives + live capture) still to be designed in that plan.
