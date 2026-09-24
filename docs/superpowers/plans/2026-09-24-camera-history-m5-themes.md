# M5 — Widget Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four preset widget themes (`light`, `dark`, `forest`, `midnight`) selectable per camera in the admin, tunable at embed time via `?theme=`, and styled through CSS variables on the widget root.

**Architecture:** `@ch/core` owns the theme whitelist + validator (source of truth for the API). The API validates `theme` on camera create/update and persists it (DB column already exists). The widget resolves the effective theme (`?theme=`, else camera theme, else `light`), writes `data-theme` on the `.widget` root, and styles itself from CSS custom properties. The admin gets a theme `<select>` in the camera form (each of web/admin duplicating the whitelist locally, per repo convention — neither depends on `@ch/core`).

**Tech Stack:** TypeScript, vitest, Fastify, React, drizzle-orm (DB already has the `theme` column from M1 — no migration), CSS custom properties.

## Global Constraints

- No DB migration: `cameras.theme text NOT NULL DEFAULT 'light'` exists since M1 (migration 0000). `CameraPatch` in `@ch/core` already has `theme?: string`.
- WP plugin (`packages/wp-plugin/`) is NOT touched — its shortcode `theme="…"` already appends `?theme=`.
- Theme whitelist values exactly: `light`, `dark`, `forest`, `midnight`.
- Precedence: `?theme=` (whitelisted) > `cameras.theme` (valid) > `light`. Unknown `?theme=` falls back to the camera theme.
- Admin UI labels are Czech: Světlé / Tmavé / Lesní / Půlnoc.
- Tracking: 6 workspace packages (admin/api/core/db/web/worker) must remain unchanged; no new deps.
- Root lint is `eslint .`; workspace typecheck/test scripts compile only `src/**` (not `test/**`).
- Cross-package: `@ch/api` imports `@ch/core` via `exports.*` → `dist/`, so rebuild core (`npm run build --workspace @ch/core`) before running api typecheck/tests.
- Commit style: conventional (feat:/test:/docs:), one commit per task.

---

### Task 1: `@ch/core` — theme whitelist, validator, and `NewCamera.theme`

**Files:**
- Create: `packages/core/src/themes.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/test/themes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const THEMES: readonly ["light", "dark", "forest", "midnight"]`
  - `export type Theme = (typeof THEMES)[number]`
  - `export function isValidTheme(theme: string): theme is Theme`
  - `NewCamera` gains `theme?: string`
  - `@ch/core` re-exports all three (`export * from "./themes.js"`)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/themes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { THEMES, isValidTheme } from "../src/themes.js";

describe("themes", () => {
  it("exposes the four approved presets", () => {
    expect(THEMES).toEqual(["light", "dark", "forest", "midnight"]);
  });

  it("accepts valid theme names", () => {
    expect(isValidTheme("light")).toBe(true);
    expect(isValidTheme("midnight")).toBe(true);
  });

  it("rejects unknown theme names", () => {
    expect(isValidTheme("custom")).toBe(false);
    expect(isValidTheme("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @ch/core`
Expected: FAIL — import error "Cannot find module '../src/themes.js'".

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/themes.ts`:

```ts
export const THEMES = ["light", "dark", "forest", "midnight"] as const;

export type Theme = (typeof THEMES)[number];

export function isValidTheme(theme: string): theme is Theme {
  return (THEMES as readonly string[]).includes(theme);
}
```

Add to `packages/core/src/index.ts` (after `export * from "./billing.js";`):

```ts
export * from "./themes.js";
```

Add `theme?: string;` to `NewCamera` in `packages/core/src/types.ts` (after the existing `enabled?: boolean;` line inside `interface NewCamera`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @ch/core`
Expected: PASS (3 new tests).

- [ ] **Step 5: Rebuild core for downstream packages**

Run: `npm run build --workspace @ch/core`
Expected: build succeeds, `packages/core/dist/themes.js` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/themes.ts packages/core/src/index.ts packages/core/src/types.ts packages/core/test/themes.test.ts
git commit -m "feat(core): theme presets, isValidTheme, NewCamera.theme"
```

---

### Task 2: `@ch/db` + `@ch/api` — persist and validate `theme`

**Files:**
- Modify: `packages/db/src/repos.ts`
- Modify: `packages/db/src/testing/fakeRepos.ts`
- Modify: `packages/api/src/routes/admin.ts`
- Test: `packages/api/test/admin.test.ts`

**Interfaces:**
- Consumes: `THEMES`, `isValidTheme` from `@ch/core`; `NewCamera.theme?`/`CameraPatch.theme?` (Task 1).
- Produces: `POST /api/v1/admin/cameras` accepts optional `theme` (default `"light"`, invalid → `400`); `PUT /api/v1/admin/cameras/:id` accepts optional `theme` (invalid → `400`). Persisted create/update returns theme in the camera object.

- [ ] **Step 1: Write failing tests**

Append to `packages/api/test/admin.test.ts` (inside the `describe("admin cameras", ...)` block, after the existing `it("rejects bad interval", ...)` test):

```ts
  it("creates a camera with a chosen theme", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Forest",
        feedType: "static_url",
        feedUrl: "https://example.com/cam.jpg",
        intervalMinutes: 15,
        theme: "forest",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().camera.theme).toBe("forest");
    await (app as { close: () => Promise<void> }).close();
  });

  it("rejects an unknown theme on create", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: {
        name: "Main",
        feedType: "static_url",
        feedUrl: "https://x/cam.jpg",
        intervalMinutes: 15,
        theme: "neon",
      },
    });
    expect(res.statusCode).toBe(400);
    await (app as { close: () => Promise<void> }).close();
  });

  it("updates the camera theme", async () => {
    const { app } = makeApp();
    const cookie = await registerAndLogin(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/cameras",
      headers: { cookie },
      payload: { name: "Main", feedType: "static_url", feedUrl: "https://x/cam.jpg", intervalMinutes: 15 },
    });
    const id = created.json().camera.id as string;
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/cameras/${id}`,
      headers: { cookie },
      payload: { theme: "midnight" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().camera.theme).toBe("midnight");
    await (app as { close: () => Promise<void> }).close();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @ch/api -- test/admin.test.ts`
Expected: FAIL — "creates a camera with a chosen theme" sees `theme` `"light"` (hardcoded in fakeRepos) instead of `"forest"`.

- [ ] **Step 3: Persist theme in both repos**

In `packages/db/src/repos.ts`, inside `createCamera(...).values({...})` add after the `enabled: input.enabled ?? true,` line:

```ts
          theme: input.theme ?? "light",
```

In `packages/db/src/testing/fakeRepos.ts`, change the hardcoded `theme: "light",` line in `createCamera` to:

```ts
        theme: input.theme ?? "light",
```

- [ ] **Step 4: Validate theme in the API**

In `packages/api/src/routes/admin.ts`:

1. Change the `@ch/core` import block (lines 2-3) to:

```ts
import { THEMES, isValidTheme, HttpError, rfc7807 } from "@ch/core";
```

2. In the `POST` handler, after the `intervalMinutes` validation, add theme parsing:

```ts
    const theme = typeof body.theme === "string" ? body.theme : "light";
    if (!isValidTheme(theme)) {
      throw new HttpError(400, "bad_request", `theme must be one of ${THEMES.join(", ")}`);
    }
```

3. In the same handler's `createCamera(...)` call, add `theme,` after the `enabled:` line.

4. In the `PUT` handler, add `"theme"` to the allowed patch keys array (line 88 `["name", ... "enabled"]`):

```ts
        ["name", "feedType", "feedUrl", "intervalMinutes", "activeFrom", "activeTo", "timezone", "enabled", "theme"].includes(k),
```

5. In the same `PUT` handler, after the existing `effectiveUrl` check, add:

```ts
    if (patch.theme !== undefined && !isValidTheme(String(patch.theme))) {
      throw new HttpError(400, "bad_request", `theme must be one of ${THEMES.join(", ")}`);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace @ch/api`
Expected: PASS (all existing + 3 new tests). Requires Task 1 build already done (`packages/core/dist` exists).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repos.ts packages/db/src/testing/fakeRepos.ts packages/api/src/routes/admin.ts packages/api/test/admin.test.ts
git commit -m "feat(api): camera theme validation on create and update"
```

---

### Task 3: `@ch/web` — widget theme resolution, `data-theme`, CSS variables

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.css`
- Test: `packages/web/src/test/App.test.tsx`

**Interfaces:**
- Consumes: `getCamera(...)` returns `PublicCamera` with `theme: string` (already the case).
- Produces: widget root `<div className="widget" data-testid="widget" data-theme={theme}>`; helper `resolveTheme(query: URLSearchParams, cameraTheme: string | undefined): string`; theme written to `document.documentElement.dataset.theme` so `body` colors follow; `buildShareUrl` includes `theme`.

- [ ] **Step 1: Write failing tests**

First, add `getCamera` to the test file imports (line 4 of `packages/web/src/test/App.test.tsx`):

```tsx
import { getCamera } from "../api";
```

Then append inside `describe("App widget", ...)` in `packages/web/src/test/App.test.tsx`:

```tsx
  it("applies the camera theme as data-theme", async () => {
    vi.mocked(getCamera).mockResolvedValueOnce({ id: "cam-1", name: "Pláž", theme: "forest", retentionMonths: 12 });
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("forest");
  });

  it("overrides the theme via ?theme", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=midnight");
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "midnight"));
  });

  it("falls back to the camera theme when ?theme is unknown", async () => {
    vi.mocked(getCamera).mockResolvedValueOnce({ id: "cam-1", name: "Pláž", theme: "forest", retentionMonths: 12 });
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=neon");
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @ch/web`
Expected: FAIL — `data-theme` attribute is missing on `.widget`.

- [ ] **Step 3: Implement theme resolution in `App.tsx`**

Add at module top (after `import "./App.css";`):

```ts
const THEMES = ["light", "dark", "forest", "midnight"];

function isValidTheme(theme: string): boolean {
  return THEMES.includes(theme);
}

function resolveTheme(query: URLSearchParams, cameraTheme: string | undefined): string {
  const q = query.get("theme");
  if (q && isValidTheme(q)) return q;
  if (cameraTheme && isValidTheme(cameraTheme)) return cameraTheme;
  return "light";
}
```

Change the camera state type (line 20) to include `theme`:

```ts
  const [camera, setCamera] = useState<{ name: string; retentionMonths: number; theme: string } | null>(null);
```

Add after the `minDate` computation (line 36):

```ts
  const theme = useMemo(() => resolveTheme(new URLSearchParams(window.location.search), camera?.theme), [camera]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
```

Change the widget root (line 65):

```tsx
    <div className="widget" data-testid="widget" data-theme={theme}>
```

Change `buildShareUrl` (line 56) to include the theme:

```ts
  const buildShareUrl = (img: ImageDto) => {
    const hour = new Date(img.timestamp).getHours();
    const p = new URLSearchParams({ date, hour: String(hour) });
    p.set("theme", theme);
    return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
  };
```

- [ ] **Step 4: Refactor `App.css` to design tokens**

Replace the entire content of `packages/web/src/App.css` with:

```css
* { box-sizing: border-box; }

:root {
  --bg: #ffffff;
  --surface: #ffffff;
  --text: #111111;
  --muted: #555555;
  --border: #dddddd;
  --accent: #2f6f4f;
}

:root[data-theme="dark"] {
  --bg: #1c1c1e;
  --surface: #2c2c2e;
  --text: #eeeeee;
  --muted: #aaaaaa;
  --border: #444444;
  --accent: #7fbf9a;
}

:root[data-theme="forest"] {
  --bg: #f3f6ef;
  --surface: #e9efe1;
  --text: #1c2b17;
  --muted: #4a6040;
  --border: #c3d0b6;
  --accent: #3e7a4c;
}

:root[data-theme="midnight"] {
  --bg: #10131a;
  --surface: #1b2230;
  --text: #e6ecf5;
  --muted: #93a3b8;
  --border: #2d3a4e;
  --accent: #5f8fd6;
}

body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
.widget { max-width: 1000px; margin: 0 auto; padding: 16px; }
.widget-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
.widget-title { color: var(--accent); }
.widget-nav { display: flex; gap: 8px; align-items: center; }
.widget-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.widget-cell { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--surface); cursor: pointer; padding: 0; position: relative; }
.widget-cell img { width: 100%; display: block; height: 90px; object-fit: cover; }
.widget-cell span { display: block; font-size: 12px; padding: 4px 8px; color: var(--muted); }
.empty, .error { color: var(--muted); text-align: center; padding: 24px; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal-content { background: var(--surface); padding: 16px; border-radius: 8px; max-width: 90vw; max-height: 90vh; overflow: auto; position: relative; }
.modal-content img { display: block; max-width: 100%; }
.modal-close { position: absolute; top: 4px; right: 4px; }
.modal-actions { margin-top: 8px; display: flex; gap: 8px; align-items: center; }
.share-url { font-size: 12px; color: var(--muted); word-break: break-all; }
button { color: var(--text); }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace @ch/web`
Expected: PASS (existing 2 + new 3 tests).

- [ ] **Step 6: Typecheck the web package**

Run: `npm run typecheck --workspace @ch/web`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.css packages/web/src/test/App.test.tsx
git commit -m "feat(web): widget theme via data-theme and CSS variables"
```

---

### Task 4: `@ch/admin` — theme dropdown in the camera form

**Files:**
- Modify: `packages/admin/src/api.ts`
- Modify: `packages/admin/src/App.tsx`
- Test: `packages/admin/src/test/App.test.tsx`

**Interfaces:**
- Consumes: API already persists `theme` (Task 2).
- Produces: `AdminCamera.theme: string`, `CameraInput.theme: string`, `THEMES: string[]`, `THEME_LABELS: Record<string, string>` in admin `api.ts`; `<select data-testid="form-theme">` in `CameraForm` between Feed URL and Interval; `emptyInput()` → `theme: "light"`; `toInput` reads `cam.theme`.

- [ ] **Step 1: Write failing tests**

In `packages/admin/src/test/App.test.tsx`:

1. Add `theme: "light"` to the `camera(...)` helper object in BOTH the `describe("App dashboard", ...)` block (after `enabled: true,`) and the `describe("App camera CRUD", ...)` block (after `enabled: true,`).

2. In the existing `it("creates a camera through the form", ...)` test, strengthen the assertion (line 178):

```tsx
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ name: "New cam", feedType: "static_url", theme: "light" });
```

3. Append a new test in the `describe("App camera CRUD", ...)` block:

```tsx
  it("creates a camera with a selected theme", async () => {
    const { fn, calls } = listServer();
    vi.stubGlobal("fetch", fn);
    render(<App />);
    await screen.findByText("Beach cam");

    await userEvent.click(screen.getByTestId("add-camera"));
    await userEvent.selectOptions(screen.getByTestId("form-theme"), "forest");
    await userEvent.type(screen.getByTestId("form-name"), "Forest cam");
    await userEvent.click(screen.getByTestId("form-submit"));

    await waitFor(() => expect(calls.some((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.u.endsWith("/api/v1/admin/cameras") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ name: "Forest cam", theme: "forest" });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @ch/admin`
Expected: FAIL — `form-theme` not found (and create POST body lacks `theme`).

- [ ] **Step 3: Extend admin `api.ts` types and constants**

1. Add `theme: string;` to `AdminCamera` (after `enabled: boolean;`).
2. Add `theme: string;` to `CameraInput`.
3. Add after the `INTERVALS` constant:

```ts
export const THEME_LABELS: Record<string, string> = {
  light: "Světlé",
  dark: "Tmavé",
  forest: "Lesní",
  midnight: "Půlnoc",
};

export const THEMES = Object.keys(THEME_LABELS);
```

- [ ] **Step 4: Wire theme into `App.tsx`**

1. Update the import (line 2):

```ts
import { api, FEED_LABELS, FEED_TYPES, INTERVALS, THEMES, THEME_LABELS, type AdminCamera, type CameraInput } from "./api";
```

2. Add `theme: "light",` to `emptyInput()` (after `timezone: "UTC",`).

3. In `CameraForm`, between the Feed URL `</label>` (line 114) and the Interval `</label>` (line 115), insert:

```tsx
        <label>
          Téma
          <select value={input.theme} onChange={(e) => set("theme", e.target.value)} data-testid="form-theme">
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
```

4. Add `theme: cam.theme,` to `toInput` (line 241).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace @ch/admin`
Expected: PASS (existing + new theme tests).

- [ ] **Step 6: Typecheck the admin package**

Run: `npm run typecheck --workspace @ch/admin`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/admin/src/api.ts packages/admin/src/App.tsx packages/admin/src/test/App.test.tsx
git commit -m "feat(admin): per-camera theme dropdown in the camera form"
```

---

### Task 5: README + full repo gates

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Document the milestone**

Append at the end of `README.md` (after the M4 Worker section):

```md
## M5 — Widget themes

Presetová témata widgetu: `light` (výchozí), `dark`, `forest`, `midnight`. Téma se nastavuje per kamera
v adminu (dropdown v editoru kamery). Embed URL `?theme=midnight` přebije téma kamery; neznámé hodnoty
spadnou na téma kamery. WP plugin shortcode `theme="dark"` už tento parametr přidává (viz M3).
```

- [ ] **Step 2: Run all gates**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run test`
Expected: PASS (api + worker + core + db + admin + web suites green).
Run: `npm run lint`
Expected: PASS.
Run: `npm run build`
Expected: PASS (6 workspace packages unchanged).
Run: `git status --porcelain`
Expected: only `README.md` and `packages/*/dist` untracked/ignored — no stray source changes in the 6 workspaces.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: M5 widget themes"
```

- [ ] **Step 4: Report**

Summarize: theme presets, precedence, API validation, widget `data-theme` + CSS variables, admin dropdown, gate results, and note WP plugin + DB untouched.