# Resort Signage — design rework (landing, deck, admin, widget) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rework all four surfaces (landing, deck, admin, widget) into the approved „Resort signage" design system — user-friendly, distinctive, consistent — without breaking any tests or embed behavior.

**Architecture:** Shared token system (§ Design tokens) implemented per package (no new shared package — surfaces are deployed independently). Fonts self-hosted via `@fontsource` npm packages in `@ch/site` and `@ch/admin`; the widget keeps system fonts. Each task ends with controller visual QA (playwright screenshots).

**Tech stack:** Vite, vanilla CSS (tokens via CSS custom properties), @fontsource packages, existing vitest suites, Playwright for QA screenshots.

**Plan type note:** This is a DESIGN rework. The token block, markup contracts and behavior rules below are BINDING (implementers transcribe them exactly). Implementers author the surrounding CSS within the tokens — the visual-QA gate (controller reads screenshots) plus the existing test suites are the quality gates.

## Global Constraints

- **Existing tests must pass unchanged**: all `data-testid`s and all test-pinned copy stay (e.g. widget `"No images for this date."`, admin empty state testids, billing testids). Adding NEW tests is allowed.
- **English only.** Existing copy stays unless a task explicitly lists new copy.
- **Widget stays neutral** (embeds into third-party sites): system fonts only, no brand fonts, 4 themes (`light/dark/forest/midnight`) via `data-theme` preserved.
- **No third-party photography/CDNs**: fonts only via `@fontsource` npm packages; imagery = live widget embeds, own screenshots, inline SVG.
- **Pricing values verbatim** from `packages/core/src/billing.ts` (14 days €5 … 36 months €69).
- Gates green: `npm run typecheck && npm test && npm run lint && npm run build`.
- Do not commit `dist/`, `node_modules/`, `.env`, `docker-compose.override.yml`.

## Design tokens (BINDING — transcribe verbatim)

```css
:root {
  --snow: #f7f9fb;
  --surface: #ffffff;
  --ink: #101828;
  --muted: #5b6b7c;
  --line: #e3e9ef;
  --glacier: #0891b2;
  --glacier-deep: #0e7490;
  --glacier-weak: #e0f2fe;
  --night: #0b1220;
  --pine: #15803d;
  --amber: #b45309;
  --red: #b91c1c;
  --radius: 10px;
}
```

**Fonts (site + admin):**
```ts
import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
```
Font stacks:
```css
--font-ui: "Archivo Variable", ui-sans-serif, system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```
Display headings: `font-weight: 700; font-stretch: 125%; letter-spacing: -0.01em;` (Archivo Variable carries the width axis).

**OSD timestamp chip (the signature — BINDING markup/CSS):**
```css
.ts-chip {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f1f5f9;
  background: rgba(11, 18, 32, 0.72);
  border-radius: 6px;
  padding: 2px 8px;
}
```

**Status pills (admin):**
```css
.pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.pill.operational { background: #dcfce7; color: var(--pine); }
.pill.delayed { background: #fef3c7; color: var(--amber); }
.pill.offline { background: #fee2e2; color: var(--red); }
```

---

### Task 1: Landing rework (`packages/site`)

**Files:**
- Modify: `packages/site/package.json` (add `@fontsource-variable/archivo`, `@fontsource/ibm-plex-mono`)
- Modify: `packages/site/index.html`
- Modify: `packages/site/src/site.css`
- Create: `packages/site/src/ridge.svg` (inline SVG markup instead is fine — pick one, no new deps)
- Modify: `packages/site/test/landing.test.ts` (additive assertions only)

**Interfaces:**
- Consumes: Task-independent (first task).
- Produces: token system + `.ts-chip` used by the deck task; font imports pattern.

- [ ] **Step 1: Install fonts** — `npm install --save-dev @fontsource-variable/archivo @fontsource/ibm-plex-mono --workspace @ch/site` (devDeps are fine; Vite bundles the css/woff2). Import them in `src/site.css` via `@import "@fontsource-variable/archivo";` etc., or in `index.html` `<script type="module">` entry — implementer's choice, must end up in the built bundle.
- [ ] **Step 2: Rework `index.html`** per the binding structure:
  - Hero = two columns (desktop grid `1fr 1fr`, stack under 900px): left = `.ts-chip` with text `LIVE — ALPINE SUMMIT`, `h1` (Archivo Expanded 800, clamp(40px, 6vw, 72px)) keeping the two tagline lines, `.lede`, CTAs; right = widget frame: `<div class="cam-frame">` with `.ts-chip` `LIVE` in its top-left corner and the existing iframe `src="/group/alpine-summit/summit"` inside.
  - Hero background: inline SVG ridge lines (2–3 polyline paths, stroke `#0891b2`, opacity ≤ 0.15, fill none) positioned behind the hero content (absolutely positioned SVG or CSS background via data URI).
  - Solution steps keep numbers (mono chips), features cards get mono kickers (`FEED TYPES`, `THEMES`, `RETENTION`, `GROUPS`, `SHARE`, `EMBED`), pricing table gains a `.ts-chip`-style `MOST POPULAR` marker on the `12 months €29` row, all existing copy/values preserved verbatim.
- [ ] **Step 3: Rework `src/site.css`** — tokens block (verbatim above), font stacks, `.ts-chip` (verbatim), display-heading rule (`font-stretch: 125%`), hero grid, `.cam-frame` (bezel + corner chip), ridge positioning, pricing row highlight (`background: var(--glacier-weak)`), button focus-visible rings (`outline: 2px solid var(--glacier); outline-offset: 2px;`), `prefers-reduced-motion` respect for any transition added.
- [ ] **Step 4: Extend `test/landing.test.ts` additively**: assert `class="ts-chip"` present; assert `LIVE — ALPINE SUMMIT`; assert `MOST POPULAR`; keep ALL existing assertions passing.
- [ ] **Step 5: Run** `npx vitest run packages/site/test/ && npm run typecheck --workspace @ch/site && npm run build --workspace @ch/site && npx eslint packages/site` → all green.
- [ ] **Step 6: Commit** `feat(site): resort signage landing rework`

---

### Task 2: Deck rework (`packages/site/deck`)

**Files:**
- Modify: `packages/site/deck/index.html`, `packages/site/src/deck.css`, `packages/site/src/deck.ts`
- Modify: `packages/site/test/deck.test.ts` (additive only)

**Interfaces:** Consumes Task 1 fonts/tokens. Produces: final deck markup consumed by the PDF export in Task 6.

- [ ] **Step 1: Markup** — every slide gets a slide marker `<div class="slide-marker">01/12</div>` … `12/12` (mono, top-right). Dark slides (1, 12) get an inline SVG ridge silhouette pinned to the slide bottom (fill `#0f1a2e`-ish tones, subtle). Slide 4: iframe `960×540`. Slides 7/8: screenshots get OSD captions (`ADMIN — CAMERAS`, `ADMIN — GROUPS`). Slide 10 gains nothing new (parity fix already shipped).
- [ ] **Step 2: CSS** — tokens; `.reveal .slides section` content max-width ~1100px, vertically centered content; `h2` ~1.9em; two-column layouts for the list slides (2, 3, 8, 10, 11); `.slide-marker` (mono, muted); `.shot` caption chips; price table in mono; keep `.dark` background rule from 3546995.
- [ ] **Step 3: deck.ts** — `transition: "fade"` (was `"slide"`); everything else unchanged.
- [ ] **Step 4: Tests additive**: assert `slide-marker` exists and `01/12` present; keep 12-slide count and all existing assertions.
- [ ] **Step 5: Run** site tests + typecheck + build → green.
- [ ] **Step 6: Commit** `feat(site): resort signage deck rework`

---

### Task 3: Admin foundation — fonts, login/register, app shell (`packages/admin`)

**Files:**
- Modify: `packages/admin/package.json` (same two @fontsource devDeps), `packages/admin/src/main.tsx` (font imports), `packages/admin/src/App.css`, `packages/admin/src/App.tsx` (Login/Register/topbar markup), tests additive only.

**Interfaces:** Consumes Task 1 tokens. Produces: `.ts-chip`, `.pill`, token variables used by Task 4.

- [ ] **Step 1:** Install fonts (`--workspace @ch/admin`), import in `main.tsx` above `./App.css`.
- [ ] **Step 2:** `App.css` — token block verbatim + font stacks + `.ts-chip` + `.pill` (BINDING blocks above) + focus-visible rings + reduced-motion.
- [ ] **Step 3: Login/Register cards** — card on `--snow` bg (surface, radius, subtle shadow, max-width 420px centered); brand row: `Camera History` + `.ts-chip` `ADMIN` (login) / `SIGN UP` (register); labels ABOVE inputs; inputs full-width with `border: 1px solid var(--line)`, radius 8px, focus border glacier; error `.error` under the field in `--red`; all `data-testid`s preserved (`login-form`, `login-email`, `login-password`, `login-submit`, `goto-register`, `register-*`, `login-error`, `register-error`); copy preserved.
- [ ] **Step 4: Topbar** — brand `Camera History`, nav links Cameras/Groups/Billing with active underline (2px glacier on the active hash route), user email muted, `Sign out` secondary button; all testids preserved (`nav-cameras`, `nav-groups`, `nav-billing`, `logout`, `admin-app`).
- [ ] **Step 5: Verify** admin tests (`npx vitest run packages/admin/src/test/App.test.tsx` 21+ PASS), typecheck/build/eslint, full repo tests; visual QA screenshots (login + register + dashboard) captured for the controller at `packages/admin` preview or production.
- [ ] **Step 6: Commit** `feat(admin): resort signage foundation — fonts, auth cards, shell`

---

### Task 4: Admin views — table, groups, forms, billing, group-delete confirm

**Files:**
- Modify: `packages/admin/src/App.tsx`, `packages/admin/src/App.css`, `packages/admin/src/Billing.tsx`, `packages/admin/src/test/App.test.tsx` (additive/adjusted for the new group-delete confirm)

**Interfaces:** Consumes Task 3 tokens/`.ts-chip`/`.pill`. Produces: group-delete confirm flow (new `data-testid="confirm-delete-group"`).

- [ ] **Step 1: Cameras table** — Status column uses `.pill.pill-operational|delayed|offline` (map from `cam.status`, labels stay `Operational/Delayed/Offline`); Last capture cell wraps the existing formatted date in `.ts-chip`; thumb column slightly larger; row `:hover` background `--snow`; `+ New camera` primary button (glacier).
- [ ] **Step 2: Groups view** — each group as a card: name (strong) + mono slug chip + `N cameras` pill; member checkboxes unchanged; embed snippet area framed with `.ts-chip` `EMBED`; Rename (secondary) / Delete (danger) buttons; `data-testid`s preserved (`groups-view` if present, group-checkbox ids, etc.).
- [ ] **Step 3: Group delete confirmation** — clicking Delete opens a modal: text `Delete group "<name>"? Cameras stay — only the group goes away.` with buttons `Delete` (`data-testid="confirm-delete-group"`, danger) and `Cancel`. Update the existing delete-group test to click through the confirm; keep all other group tests passing.
- [ ] **Step 4: CameraForm modal** — labels above inputs, helper `.field-hint` kept, Save primary / Cancel secondary, error text in `--red`; all `data-testid`s preserved (`form-name`, `form-feed-type`, `form-feed-url`, `form-theme`, `form-interval`, `form-submit`, `form-cancel`, `group-checkbox-*`).
- [ ] **Step 5: Billing.tsx** — restyle cards/tiers to tokens (prices in mono); keep all testids/copy pinned by `Billing.test.tsx`.
- [ ] **Step 6: Verify** — admin tests all PASS (incl. adjusted delete-group test), full repo tests, typecheck/build/eslint; visual QA screenshots (dashboard, groups, billing, camera form, group delete confirm).
- [ ] **Step 7: Commit** `feat(admin): signage views — table, groups, forms, billing, delete confirm`

---

### Task 5: Widget polish (`packages/web`) — neutral, theme-aware

**Files:**
- Modify: `packages/web/src/App.tsx`, `packages/web/src/App.css`
- Modify: `packages/web/src/test/App.test.tsx` (additive only)

**Interfaces:** Consumes nothing new. Produces: polished embed UI; all `data-testid`s and pinned copy unchanged (`image-grid`, `image-<id>`, `share-modal`, `modal-image`, `widget`, `camera-switcher`, `group-empty`, copy `No images for this date.`).

- [ ] **Step 1: Theme tokens** — define per-theme CSS custom properties in `App.css` for `[data-theme="light|dark|forest|midnight"]` (bg, surface, ink, muted, line, accent; keep current theme hues/character: light≈#f8fafb, dark≈#0b1220, forest≈dark green-tinted, midnight≈deep navy; accents per theme).
- [ ] **Step 2: Header** — group/camera title = strong plain text (NOT anchor-blue); camera `<select>` and date `<input type="date">` styled theme-aware (surface bg, ink text, radius 8px, 1px line border); prev/next day buttons ≥36×36px hit area.
- [ ] **Step 3: Grid cells** — each `<button class="widget-cell">` keeps `img` + adds the timestamp as `.ts-chip` overlay positioned bottom-left INSIDE the image (mono system stack); remove the caption-below-text layout; hover = subtle `transform: scale(1.02)` + ring; `focus-visible` ring; timestamps keep the existing `new Date(...).toLocaleTimeString()` formatting.
- [ ] **Step 4: Loading skeleton** — while images are loading (add `loading` state), render 8 `.skeleton` cells (shimmer via CSS `@keyframes`, respects `prefers-reduced-motion`); empty state text stays `No images for this date.`
- [ ] **Step 5: Modal** — larger close button (36px), `Copy link` keeps behavior + gains a transient `Copied` confirmation text next to the URL; `alt` attributes kept.
- [ ] **Step 6: Verify** — `npx vitest run packages/web/src/test/App.test.tsx` all PASS; typecheck/build/eslint; full repo tests; visual QA screenshots of `/group/alpine-summit/summit` in `light` and `midnight` themes (`?theme=midnight`) — day and night captures.
- [ ] **Step 7: Commit** `feat(web): signage polish — osd chips, controls, skeletons, modal`

---

### Task 6: Final visual QA + PDF + deploy smoke

**Files:**
- Create (output): `packages/site/public/deck.pdf` (regenerated)

**Interfaces:** Consumes all prior tasks. Produces: deployed surfaces + refreshed PDF.

- [ ] **Step 1:** Build all: `npm run build` (root) → exit 0.
- [ ] **Step 2:** Regenerate the PDF: start `vite preview` on 8082 detached, `npm run deck:pdf --workspace @ch/site`, free port with `fuser -k 8082/tcp || true`; verify `file packages/site/public/deck.pdf` → PDF; prod `/deck.pdf` → 200 `application/pdf`.
- [ ] **Step 3:** Production smoke: landing 200 + tagline; `/deck/` 200; `/group/alpine-summit/summit` 200 + widget asset 200; `/admin/` 200 + admin asset 200; group JSON 200.
- [ ] **Step 4:** Full gates: `npm run typecheck && npm test && npm run lint && npm run build` → all 0.
- [ ] **Step 5:** Visual QA screenshots for the controller: landing, deck hero (`?cb=` cache-buster), deck print-pdf full page, widget (light + midnight), admin login + dashboard + groups. Controller reads them; any visual defect → fix round.
- [ ] **Step 6: Commit** (only if artifacts changed, e.g. deck.pdf): `chore(site): regenerate deck pdf after signage rework`

---

## Self-Review

- **Spec coverage:** tokens/signature (§2 → all tasks), landing (§3 → T1), deck (§4 → T2), admin (§5 → T3+T4 incl. group-delete confirm), widget (§6 → T5), QA/deploy (§7 → T6 + visual QA gates). §8 exclusions respected.
- **Placeholder scan:** none — binding blocks are verbatim; per-surface requirements are explicit lists; the intentionally implementer-authored part (CSS details within tokens) is declared in the plan header with its own QA gate.
- **Type/consistency check:** `.ts-chip`/`.pill` names, token names, testids and copy strings are used identically across tasks; pricing strings match `packages/core/src/billing.ts`.
