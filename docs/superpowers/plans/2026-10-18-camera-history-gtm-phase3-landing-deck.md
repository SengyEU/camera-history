# GTM Fáze 3 — Landing + Reveal.js Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an English marketing landing at `https://camera.sengycraft.cz/` and a Reveal.js pitch deck at `/deck/` (with PDF export), both dogfooding the real live widget as the demo.

**Architecture:** New static package `packages/site` (Vite multi-page build: `index.html` = landing, `deck/index.html` = Reveal deck) becomes the nginx site root. The existing widget SPA (`packages/web`) moves to a `/widget/` base so its built assets live under `/widget/assets/…`; nginx routes `/widget/` and `/group/` to it. Screenshots for the deck are captured with Playwright against the live production admin; the deck PDF is exported headlessly with Playwright print-to-PDF.

**Tech Stack:** Vite 6, TypeScript 5, Reveal.js 5, Vitest 3 (node env), Playwright (chromium), nginx, existing repo gates (`typecheck`/`test`/`lint`/`build`).

## Global Constraints

- **English only** in all landing/deck copy (no i18n switcher; out of scope). Brand in footer/CTA: **Sengycraft**.
- **Contact/CTA target:** `mailto:hello@sengycraft.cz` everywhere a contact CTA appears.
- **Live demo target (dogfood):** the real public group widget `https://camera.sengycraft.cz/group/alpine-summit/summit` (embed via relative URL `/group/alpine-summit/summit`).
- **Hosting:** existing host, domain `camera.sengycraft.cz`; **landing at `/`**, **deck at `/deck/`**; product surfaces keep `/admin/` and `/api/`.
- **Deck:** Reveal.js hosted online + **PDF via print-to-PDF** (Playwright `page.pdf()` against `?print-pdf`).
- **Pricing must equal the product's tiers verbatim** (from `packages/core/src/billing.ts`): 14 days €5, 1 month €9, 3 months €15, 6 months €22, 12 months €29, 24 months €49, 36 months €69 — EUR **per camera**.
- **Visual direction "Alpine clean"** for the landing (light, airy, cool neutrals + one fresh accent); deck = gentle hybrid (light base, dark hero passages).
- **No third-party photography**: hero visuals are CSS gradients; the only real imagery is the live widget embed and admin screenshots we produce ourselves.
- Existing gates must stay green: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` (all exit 0).
- Do **not** commit `.env`, `docker-compose.override.yml`, `node_modules/`, `dist/`.
- Existing per-package conventions (mirror `packages/web`): `"type": "module"`, `private: true`, scripts `dev/build/preview/typecheck/test/clean`, tsconfig `extends: ../../tsconfig.base.json`, noEmit.

---

### Task 1: `packages/site` package + landing page

**Files:**
- Create: `packages/site/package.json`
- Create: `packages/site/tsconfig.json`
- Create: `packages/site/vite.config.ts`
- Create: `packages/site/index.html`
- Create: `packages/site/src/site.css`
- Create: `packages/site/test/landing.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: workspace `@ch/site`; build output `packages/site/dist/index.html` (landing at `/`); the package's `vitest`/`vite` setup that Task 2 extends with the deck entry. Landing HTML anchors used by tests: tagline text, `mailto:hello@sengycraft.cz`, iframe `src="/group/alpine-summit/summit"`, pricing strings.

- [ ] **Step 1: Create `packages/site/package.json`**

```json
{
  "name": "@ch/site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 8081",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "preview": "vite preview --port 8081 --strictPort",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "screenshots": "node scripts/capture-admin-screenshots.mjs",
    "deck:pdf": "node scripts/export-deck-pdf.mjs",
    "clean": "node -e \"fs.rmSync('dist',{recursive:true,force:true})\""
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.6.3",
    "vite": "^6.0.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/site/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "types": ["vite/client", "vitest/globals", "node"]
  },
  "include": ["src", "test", "vite.config.ts", "scripts"]
}
```

- [ ] **Step 3: Create `packages/site/vite.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/",
  server: { host: "127.0.0.1", port: 8081 },
  build: {
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        deck: fileURLToPath(new URL("./deck/index.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
  },
});
```

Note: `deck/index.html` does not exist until Task 2 — create a minimal placeholder now so this config does not break, and Task 2 replaces it:

`packages/site/deck/index.html` (temporary, Task 2 rewrites it):
```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Deck</title></head><body></body></html>
```

- [ ] **Step 4: Link the workspace**

Run: `npm install`
Expected: exit 0; `node_modules/@ch/site` symlink appears (`ls -la node_modules/@ch`).

- [ ] **Step 5: Create the landing `packages/site/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Camera History — Time-lapse history for your webcam</title>
    <meta
      name="description"
      content="Turn any public webcam into a browsable archive. Embed a widget that lets visitors scroll back through days of captures."
    />
    <link rel="stylesheet" href="/src/site.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/">Camera&nbsp;History</a>
      <nav class="site-nav">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#demo">Live demo</a>
        <a class="nav-cta" href="mailto:hello@sengycraft.cz">Get in touch</a>
      </nav>
    </header>

    <section class="hero">
      <h1>
        Your webcam only shows now.
        <span class="accent">We add the history.</span>
      </h1>
      <p class="lede">
        Camera History turns any public webcam into a browsable archive. Embed a widget that lets
        visitors scroll back through days of captures — no code, one iframe.
      </p>
      <div class="hero-actions">
        <a class="btn primary" href="#demo">See the live demo</a>
        <a class="btn ghost" href="mailto:hello@sengycraft.cz">Get in touch</a>
      </div>
    </section>

    <section class="section problem">
      <h2>A webcam shows one moment. Visitors who missed it are gone.</h2>
      <ul class="cols">
        <li>Yesterday's powder day is nowhere to be seen.</li>
        <li>The sunset, the storm, the first snow — overwritten.</li>
        <li>Your live feed earns a glance, not a visit to your site.</li>
      </ul>
    </section>

    <section class="section solution">
      <h2>One widget. Every moment you captured.</h2>
      <ol class="steps">
        <li><strong>We capture your camera</strong> every few minutes, around the clock.</li>
        <li><strong>Captures are stored safely</strong> in your archive for up to 36 months.</li>
        <li><strong>You embed one iframe</strong> and visitors browse the history by day.</li>
      </ol>
    </section>

    <section id="demo" class="section demo">
      <h2>See it live</h2>
      <p>This is a real widget, embedded on this page, capturing real cameras right now.</p>
      <div class="demo-frame">
        <iframe
          src="/group/alpine-summit/summit"
          title="Camera History live demo"
          width="100%"
          height="640"
          style="border: 0"
          loading="lazy"
        ></iframe>
      </div>
      <p><a href="/group/alpine-summit/summit">Open the demo in a new tab</a></p>
    </section>

    <section id="features" class="section features">
      <h2>Everything a resort webcam needs</h2>
      <div class="cards">
        <article class="card"><h3>Any feed type</h3><p>Static JPEG, MJPEG, HLS, RTSP or a custom WebSocket — point us at your camera.</p></article>
        <article class="card"><h3>Themes</h3><p>Light, Dark, Forest and Midnight so the widget blends into your site.</p></article>
        <article class="card"><h3>Long retention</h3><p>Keep history for 14 days up to 36 months — you choose.</p></article>
        <article class="card"><h3>Camera groups</h3><p>Group your angles and let visitors switch between them in one widget.</p></article>
        <article class="card"><h3>Share every moment</h3><p>Every capture has a permanent link — perfect for social posts.</p></article>
        <article class="card"><h3>Works anywhere</h3><p>One iframe on any website, plus a WordPress plugin for the easy path.</p></article>
      </div>
    </section>

    <section id="pricing" class="section pricing">
      <h2>Simple pricing, per camera</h2>
      <p class="muted">EUR, per camera, VAT excl. Longer retention costs less per month.</p>
      <table class="price-table">
        <thead><tr><th>Retention</th><th>Price per camera</th></tr></thead>
        <tbody>
          <tr><td>14 days</td><td>€5</td></tr>
          <tr><td>1 month</td><td>€9</td></tr>
          <tr><td>3 months</td><td>€15</td></tr>
          <tr><td>6 months</td><td>€22</td></tr>
          <tr><td>12 months</td><td>€29</td></tr>
          <tr><td>24 months</td><td>€49</td></tr>
          <tr><td>36 months</td><td>€69</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section audiences">
      <h2>Built for anyone with a camera and an audience</h2>
      <ul class="cols">
        <li>Ski resorts &amp; mountain destinations</li>
        <li>Beaches, marinas &amp; kite spots</li>
        <li>Tourist attractions &amp; landmarks</li>
        <li>Construction sites &amp; progress cams</li>
        <li>Weather &amp; nature streams</li>
      </ul>
    </section>

    <section class="section why">
      <h2>Why Camera History</h2>
      <ul class="cols">
        <li><strong>Self-service dashboard</strong> — add cameras and grab your embed snippet in minutes.</li>
        <li><strong>Built for operators</strong> — no servers, no ffmpeg, no maintenance on your side.</li>
        <li><strong>Real product, live today</strong> — the demo above runs the same code you would embed.</li>
      </ul>
    </section>

    <section class="cta-band">
      <h2>Show your visitors more than right now</h2>
      <div class="hero-actions">
        <a class="btn primary" href="/group/alpine-summit/summit">See the live demo</a>
        <a class="btn ghost" href="mailto:hello@sengycraft.cz">Get in touch</a>
      </div>
    </section>

    <footer class="site-footer">
      <span>© Sengycraft</span>
      <a href="mailto:hello@sengycraft.cz">hello@sengycraft.cz</a>
    </footer>
  </body>
</html>
```

- [ ] **Step 6: Create `packages/site/src/site.css`**

```css
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --accent: #0284c7;
  --accent-weak: #e0f2fe;
  --radius: 14px;
  --maxw: 1080px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.6;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.site-header {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px; padding: 14px 24px;
  background: rgba(248, 250, 252, 0.9);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
.site-nav { display: flex; gap: 18px; align-items: center; font-size: 15px; }
.nav-cta { font-weight: 600; }
.hero {
  max-width: var(--maxw); margin: 0 auto; padding: 96px 24px 64px;
}
.hero h1 { font-size: clamp(34px, 5vw, 56px); line-height: 1.1; margin: 0 0 20px; letter-spacing: -0.02em; }
.hero .accent { color: var(--accent); display: block; }
.lede { font-size: clamp(17px, 2vw, 20px); color: var(--muted); max-width: 640px; }
.hero-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
.btn {
  display: inline-block; padding: 12px 22px; border-radius: 999px;
  font-weight: 600; font-size: 15px;
}
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: #0369a1; text-decoration: none; }
.btn.ghost { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.btn.ghost:hover { border-color: var(--accent); text-decoration: none; }
.section { max-width: var(--maxw); margin: 0 auto; padding: 64px 24px; }
.section h2 { font-size: clamp(24px, 3vw, 34px); line-height: 1.2; margin: 0 0 20px; letter-spacing: -0.01em; }
.muted { color: var(--muted); }
.cols { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.cols li { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
.steps { list-style: none; counter-reset: step; padding: 0; display: grid; gap: 14px; }
.steps li { counter-increment: step; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px 18px 64px; position: relative; }
.steps li::before {
  content: counter(step);
  position: absolute; left: 18px; top: 18px;
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent-weak); color: var(--accent);
  display: grid; place-items: center; font-weight: 700;
}
.demo-frame { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
.card h3 { margin: 0 0 8px; font-size: 17px; }
.card p { margin: 0; color: var(--muted); }
.price-table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.price-table th, .price-table td { text-align: left; padding: 12px 18px; border-bottom: 1px solid var(--line); }
.price-table th { background: var(--accent-weak); color: var(--accent); font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; }
.cta-band { margin-top: 48px; padding: 72px 24px; background: #0b1220; color: #f1f5f9; text-align: center; }
.cta-band h2 { margin: 0 0 20px; font-size: clamp(24px, 3vw, 34px); }
.cta-band .hero-actions { justify-content: center; }
.site-footer {
  display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  max-width: var(--maxw); margin: 0 auto; padding: 28px 24px 48px; color: var(--muted); font-size: 14px;
}
```

- [ ] **Step 7: Write the failing test `packages/site/test/landing.test.ts`**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("landing page", () => {
  it("has the product title and hero tagline", () => {
    expect(html).toContain("<title>Camera History — Time-lapse history for your webcam</title>");
    expect(html).toContain("Your webcam only shows now.");
    expect(html).toContain("We add the history.");
  });

  it("embeds the live group widget and links to it", () => {
    expect(html).toContain('src="/group/alpine-summit/summit"');
    expect(html).toContain('href="/group/alpine-summit/summit"');
  });

  it("uses the Sengycraft contact email in CTAs", () => {
    expect(html).toContain("mailto:hello@sengycraft.cz");
    expect(html).toContain("hello@sengycraft.cz");
  });

  it("lists the exact product pricing tiers", () => {
    for (const [label, price] of [
      ["14 days", "€5"],
      ["1 month", "€9"],
      ["3 months", "€15"],
      ["6 months", "€22"],
      ["12 months", "€29"],
      ["24 months", "€49"],
      ["36 months", "€69"],
    ]) {
      expect(html).toContain(label);
      expect(html).toContain(price);
    }
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run packages/site/test/landing.test.ts`
Expected: it may already pass if you wrote the HTML first; to satisfy TDD, temporarily rename `index.html` away, watch the test FAIL with `ENOENT`, rename it back, then continue. (The deliverable state is PASS.)

- [ ] **Step 9: Run tests, typecheck and build to verify they pass**

Run: `npx vitest run packages/site/test/landing.test.ts && npm run typecheck --workspace @ch/site && npm run build --workspace @ch/site`
Expected: tests PASS; typecheck exit 0; build exit 0 and `packages/site/dist/index.html` exists.

- [ ] **Step 10: Commit**

```bash
git add packages/site/package.json packages/site/tsconfig.json packages/site/vite.config.ts packages/site/index.html packages/site/src/site.css packages/site/test/landing.test.ts packages/site/deck/index.html package-lock.json
git commit -m "feat(site): marketing landing page with live demo embed"
```

---

### Task 2: Reveal.js deck at `/deck/`

**Files:**
- Modify: `packages/site/package.json` (add `reveal.js`)
- Modify: `packages/site/deck/index.html` (replace the Task 1 placeholder)
- Create: `packages/site/src/deck.css`
- Create: `packages/site/src/deck.ts`
- Create: `packages/site/test/deck.test.ts`

**Interfaces:**
- Consumes: Task 1's package/vite/test setup; screenshot assets `public/admin-cameras.png` (produced in Task 3 — the `<img>` may 404 until then).
- Produces: `packages/site/dist/deck/index.html` (deck at `/deck/`), 12 `<section>` slides, `?print-pdf` support consumed by Task 5's PDF export.

- [ ] **Step 1: Add Reveal.js**

Run: `npm install --save-dev reveal.js --workspace @ch/site`
Expected: exit 0; `node_modules/reveal.js/dist/reveal.css` and `node_modules/reveal.js/dist/print/pdf.css` exist (`ls node_modules/reveal.js/dist/print/` → `paper.css  pdf.css`).

- [ ] **Step 2: Write the failing test `packages/site/test/deck.test.ts`**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../deck/index.html", import.meta.url), "utf8");
const slideCount = (html.match(/<section/g) ?? []).length;

describe("deck", () => {
  it("has exactly 12 slides", () => {
    expect(slideCount).toBe(12);
  });

  it("opens with the hero tagline", () => {
    expect(html).toContain("<title>Camera History — Sales Deck</title>");
    expect(html).toContain("Your webcam only shows now.");
    expect(html).toContain("We add the history.");
  });

  it("embeds the live demo and the admin screenshot", () => {
    expect(html).toContain('src="/group/alpine-summit/summit"');
    expect(html).toContain('src="/admin-cameras.png"');
  });

  it("includes pricing and the contact CTA", () => {
    expect(html).toContain("36 months");
    expect(html).toContain("€69");
    expect(html).toContain("mailto:hello@sengycraft.cz");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/site/test/deck.test.ts`
Expected: FAIL (placeholder has no slides/tagline).

- [ ] **Step 4: Replace `packages/site/deck/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Camera History — Sales Deck</title>
    <script type="module" src="/src/deck.ts"></script>
  </head>
  <body>
    <div class="reveal">
      <div class="slides">
        <section class="dark" data-background-color="#0b1220">
          <p class="eyebrow">Camera History</p>
          <h1>Your webcam only shows now. <span class="accent">We add the history.</span></h1>
          <p class="sub">A browsable archive for every public webcam — embedded in your site in minutes.</p>
        </section>

        <section>
          <h2>The problem</h2>
          <ul>
            <li>A webcam shows one moment — then it is gone.</li>
            <li>Visitors who missed the powder day, the sunset or the storm never come back.</li>
            <li>Your live feed earns a glance, not a place in your visitors' plans.</li>
          </ul>
        </section>

        <section>
          <h2>The solution</h2>
          <ul>
            <li>We capture your camera every few minutes and keep the archive for you.</li>
            <li>You embed one <code>&lt;iframe&gt;</code> — visitors browse history by day.</li>
            <li>Camera groups, four themes, shareable links and long retention included.</li>
          </ul>
        </section>

        <section>
          <h2>Live demo</h2>
          <p>This deck embeds the real product running right now.</p>
          <iframe
            src="/group/alpine-summit/summit"
            title="Camera History live demo"
            width="100%"
            height="520"
            style="border: 0"
            data-prevent-swipe="true"
          ></iframe>
        </section>

        <section>
          <h2>How it works</h2>
          <div class="flow">
            <div class="flow-step"><strong>1. Capture</strong><span>Your camera is fetched every few minutes, around the clock.</span></div>
            <div class="flow-arrow">→</div>
            <div class="flow-step"><strong>2. Store</strong><span>Captures are kept safe for up to 36 months.</span></div>
            <div class="flow-arrow">→</div>
            <div class="flow-step"><strong>3. Embed</strong><span>Drop one iframe into your site. Done.</span></div>
          </div>
        </section>

        <section>
          <h2>Features</h2>
          <div class="grid-2">
            <div><strong>Any feed type</strong><br />JPEG, MJPEG, HLS, RTSP or custom WebSocket.</div>
            <div><strong>Four themes</strong><br />Light, Dark, Forest, Midnight.</div>
            <div><strong>Retention up to 36 months</strong><br />Pick the history your audience needs.</div>
            <div><strong>Camera groups</strong><br />One widget, many angles, instant switching.</div>
            <div><strong>Shareable links</strong><br />Every capture gets a permanent URL.</div>
            <div><strong>Mobile ready</strong><br />Works on every screen, on every site.</div>
          </div>
        </section>

        <section>
          <h2>Admin dashboard</h2>
          <p>Self-service: add cameras, check status, grab your embed snippet.</p>
          <img class="shot" src="/admin-cameras.png" alt="Camera History admin dashboard" />
        </section>

        <section>
          <h2>Integrations</h2>
          <ul>
            <li><strong>WordPress plugin</strong> — install, paste your camera ID, done.</li>
            <li><strong>Any website</strong> — one iframe snippet from your dashboard.</li>
            <li><strong>Camera groups</strong> — embed a whole resort with a switcher.</li>
          </ul>
        </section>

        <section>
          <h2>Pricing</h2>
          <p class="muted">EUR per camera, VAT excl.</p>
          <table class="price-table">
            <tbody>
              <tr><td>14 days</td><td>€5</td></tr>
              <tr><td>1 month</td><td>€9</td></tr>
              <tr><td>3 months</td><td>€15</td></tr>
              <tr><td>6 months</td><td>€22</td></tr>
              <tr><td>12 months</td><td>€29</td></tr>
              <tr><td>24 months</td><td>€49</td></tr>
              <tr><td>36 months</td><td>€69</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Who it is for</h2>
          <ul>
            <li>Ski resorts &amp; mountain destinations</li>
            <li>Beaches, marinas &amp; kite spots</li>
            <li>Tourist attractions &amp; landmarks</li>
            <li>Construction &amp; progress cameras</li>
          </ul>
        </section>

        <section>
          <h2>Why Camera History</h2>
          <ul>
            <li>Self-service product — live today, not a prototype.</li>
            <li>Zero maintenance on your side — no servers, no ffmpeg.</li>
            <li>Your branding stays yours — the widget is neutral and fits in.</li>
          </ul>
        </section>

        <section class="dark" data-background-color="#0b1220">
          <h2>See your history, not just now</h2>
          <p class="sub">
            <a class="btn" href="/group/alpine-summit/summit">Open the live demo</a>
            <a class="btn ghost" href="mailto:hello@sengycraft.cz">hello@sengycraft.cz</a>
          </p>
          <p class="footer-note">Camera History by Sengycraft</p>
        </section>
      </div>
    </div>
  </body>
</html>
```

- [ ] **Step 5: Create `packages/site/src/deck.ts`**

```ts
import Reveal from "reveal.js";
import "reveal.js/dist/reveal.css";
import printPdfUrl from "reveal.js/dist/print/pdf.css?url";
import "./deck.css";

if (window.location.search.includes("print-pdf")) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = printPdfUrl;
  link.media = "print";
  document.head.appendChild(link);
}

const deck = new Reveal({
  hash: true,
  slideNumber: true,
  controls: true,
  progress: true,
  transition: "slide",
  width: 1280,
  height: 720,
});

void deck.initialize();
```

(If `reveal.js/dist/print/pdf.css` turns out absent in the installed version — check with `ls node_modules/reveal.js/dist/print/` in Step 1 — use the path actually present, e.g. `reveal.js/plugin/print-pdf/print-pdf.js`, and keep the `?print-pdf` + media="print" mechanism: Reveal adds the `print-pdf` class to `<html>` and the stylesheet does the layout.)

TypeScript fallback: check whether the installed `reveal.js` ships types (`ls node_modules/reveal.js/dist/*.d.ts node_modules/reveal.js/*.d.ts`). If it does not and `tsc` reports `Could not find a declaration file for module 'reveal.js'`, create `packages/site/src/reveal.d.ts`:

```ts
declare module "reveal.js" {
  interface RevealConfig {
    hash?: boolean;
    slideNumber?: boolean;
    controls?: boolean;
    progress?: boolean;
    transition?: "none" | "fade" | "slide" | "convex" | "concave" | "zoom";
    width?: number;
    height?: number;
  }
  export default class Reveal {
    constructor(config?: RevealConfig);
    initialize(): Promise<void>;
  }
}
```

Do not leave `any`-casts in `deck.ts`; the fallback declaration above is the only fallback permitted.

- [ ] **Step 6: Create `packages/site/src/deck.css`**

```css
:root {
  --bg: #f8fafc;
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --accent: #38bdf8;
  --accent-ink: #0284c7;
}
.reveal {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink);
}
.reveal .slides { text-align: left; }
.reveal .slides section { background: var(--bg); }
.reveal section.dark { color: #f1f5f9; }
.reveal h1 { font-size: 2.1em; line-height: 1.12; letter-spacing: -0.02em; text-transform: none; }
.reveal h2 { font-size: 1.6em; letter-spacing: -0.01em; text-transform: none; }
.reveal .accent { color: var(--accent); display: block; }
.reveal .eyebrow { color: var(--accent); letter-spacing: 0.18em; text-transform: uppercase; font-size: 0.5em; }
.reveal .sub { color: var(--muted); font-size: 0.7em; max-width: 26em; }
.reveal section.dark .sub { color: #94a3b8; }
.reveal ul { display: block; }
.reveal li { font-size: 0.72em; margin: 0.35em 0; }
.reveal code { background: #e2e8f0; border-radius: 6px; padding: 0 6px; font-size: 0.9em; }
.reveal .muted { color: var(--muted); }
.reveal .shot { width: 100%; max-height: 420px; object-fit: cover; object-position: top; border: 1px solid var(--line); border-radius: 10px; }
.reveal .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5em 2em; font-size: 0.68em; }
.reveal .flow { display: flex; gap: 0.8em; align-items: stretch; }
.reveal .flow-step { flex: 1; border: 1px solid var(--line); border-radius: 10px; padding: 0.6em; font-size: 0.6em; display: flex; flex-direction: column; gap: 0.3em; background: #fff; }
.reveal .flow-arrow { align-self: center; color: var(--accent-ink); font-size: 1em; }
.reveal .price-table { width: 100%; border-collapse: collapse; font-size: 0.62em; background: #fff; }
.reveal .price-table td { border-bottom: 1px solid var(--line); padding: 0.25em 0.6em; }
.reveal .btn {
  display: inline-block; background: var(--accent-ink); color: #fff; border-radius: 999px;
  padding: 0.5em 1.1em; font-size: 0.6em; margin-right: 0.5em; text-decoration: none;
}
.reveal .btn.ghost { background: transparent; color: inherit; border: 1px solid #475569; }
.reveal .footer-note { margin-top: 1em; font-size: 0.5em; color: #64748b; }
```

- [ ] **Step 7: Run tests, typecheck and build to verify they pass**

Run: `npx vitest run packages/site/test/ && npm run typecheck --workspace @ch/site && npm run build --workspace @ch/site`
Expected: deck test PASS (12 slides), landing test still PASS, typecheck 0, build 0, `packages/site/dist/deck/index.html` exists.

- [ ] **Step 8: Commit**

```bash
git add packages/site/package.json packages/site/deck/index.html packages/site/src/deck.css packages/site/src/deck.ts packages/site/test/deck.test.ts package-lock.json
git commit -m "feat(site): reveal.js sales deck with live demo and pdf mode"
```

---

### Task 3: Admin screenshots for the deck (Playwright)

**Files:**
- Modify: `packages/site/package.json` (add `playwright`)
- Create: `packages/site/scripts/capture-admin-screenshots.mjs`
- Create (output): `packages/site/public/admin-cameras.png`, `packages/site/public/admin-groups.png`

**Interfaces:**
- Consumes: live production admin at `https://camera.sengycraft.cz/admin/` + demo credentials (Task 2's deck references `/admin-cameras.png`).
- Produces: `public/admin-cameras.png` and `public/admin-groups.png`, copied into `dist/` by Vite and thus served at `/admin-cameras.png` and `/admin-groups.png` for the deck PDF in Task 5.

- [ ] **Step 1: Add Playwright and install chromium**

```bash
npm install --save-dev playwright --workspace @ch/site
npx playwright install chromium --with-deps
```
Expected: both exit 0; `ls ~/.cache/ms-playwright | grep chromium` shows a chromium build.

- [ ] **Step 2: Create `packages/site/scripts/capture-admin-screenshots.mjs`**

```js
#!/usr/bin/env node
// Captures admin dashboard screenshots for the sales deck from the live product.
// Usage: BASE_URL=... DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/capture-admin-screenshots.mjs

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "https://camera.sengycraft.cz").replace(/\/+$/, "");
const EMAIL = process.env.DEMO_EMAIL ?? "owner@alpinesummit.example";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Resort-2026!";

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/admin/`, { waitUntil: "networkidle" });
await page.getByTestId("login-email").fill(EMAIL);
await page.getByTestId("login-password").fill(PASSWORD);
await page.getByTestId("login-submit").click();
await page.getByTestId("admin-app").waitFor();
await page.getByText("Gondola Summit").first().waitFor();
await page.screenshot({ path: new URL("../public/admin-cameras.png", import.meta.url).pathname });
console.log("+ public/admin-cameras.png");

await page.getByTestId("nav-groups").click();
await page.getByText("Summit").first().waitFor();
await page.screenshot({ path: new URL("../public/admin-groups.png", import.meta.url).pathname });
console.log("+ public/admin-groups.png");

await browser.close();
```

- [ ] **Step 3: Run the capture against production**

Run: `npm run screenshots --workspace @ch/site`
Expected: two `+ public/…png` lines; verify:
`file packages/site/public/admin-cameras.png packages/site/public/admin-groups.png` → `PNG image data, 1600 x 1000`; sizes > 50 KB (`ls -la packages/site/public/`).

- [ ] **Step 4: Rebuild and verify the deck references resolve**

Run: `npm run build --workspace @ch/site && ls packages/site/dist/admin-cameras.png packages/site/dist/admin-groups.png`
Expected: both files copied into `dist/`.

- [ ] **Step 5: Commit**

```bash
git add packages/site/package.json packages/site/scripts/capture-admin-screenshots.mjs packages/site/public/admin-cameras.png packages/site/public/admin-groups.png package-lock.json
git commit -m "feat(site): capture admin screenshots for the deck"
```

---

### Task 4: Move the widget SPA to `/widget/` and rewire nginx

**Files:**
- Modify: `packages/web/vite.config.ts` (base `/` → `/widget/`)
- Create: `deploy/nginx/camera.sengycraft.cz.conf` (repo copy of the host config)
- Modify (host): `/etc/nginx/sites-available/camera.sengycraft.cz`

**Interfaces:**
- Consumes: `packages/site/dist` (landing+deck), `packages/web/dist` (widget SPA), existing `/admin/` alias and `/api/` proxy.
- Produces: public routing — `/` landing, `/deck/` deck, `/widget/…` and `/group/…` widget SPA (assets under `/widget/assets/…`), `/admin/`, `/api/` unchanged.

- [ ] **Step 1: Change the web SPA base**

In `packages/web/vite.config.ts` change `base: "/"` to:

```ts
base: "/widget/",
```

- [ ] **Step 2: Rebuild the web SPA and inspect the built index**

Run: `npm run build --workspace @ch/web && grep -o '/widget/assets/[^"]*' packages/web/dist/index.html`
Expected: build exit 0; the grep prints `/widget/assets/index-*.js` (and a css entry) — confirming asset URLs now live under `/widget/`.

- [ ] **Step 3: Store the nginx config in the repo at `deploy/nginx/camera.sengycraft.cz.conf`**

```nginx
# Camera History SaaS — camera.sengycraft.cz
# TLS terminates at Cloudflare edge; origin listens on 443 with Cloudflare origin cert.
server {
    listen 80;
    server_name camera.sengycraft.cz;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name camera.sengycraft.cz;

    root /home/ubuntu/camera-history/packages/site/dist;
    index index.html;

    access_log /var/log/nginx/camera.sengycraft.cz.log;
    error_log  /var/log/nginx/camera.sengycraft.cz.log error;

    ssl_certificate     /etc/cloudflare/cert/cert.pem;
    ssl_certificate_key /etc/cloudflare/cert/cert.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    client_max_body_size 50m;

    # Widget je urcen k embedovani na cizich webech -> dovolit framing.
    add_header Content-Security-Policy "frame-ancestors *" always;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy same-origin;

    # Frontend + backend: vse pod /api/v1/...
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin dashboard SPA (/admin/)
    location /admin/ {
        alias /home/ubuntu/camera-history/packages/admin/dist/;
        try_files $uri $uri/ /admin/index.html;
    }

    # Embeddable widget SPA (/widget/:tenant/:cameraId and /group/:tenant/:slug)
    location /widget/ {
        alias /home/ubuntu/camera-history/packages/web/dist/;
        try_files $uri /widget/index.html;
    }
    location /group/ {
        alias /home/ubuntu/camera-history/packages/web/dist/;
        try_files $uri /widget/index.html;
    }

    # Static landing + deck (real files only)
    location / {
        try_files $uri $uri/ =404;
    }
}
```

- [ ] **Step 4: Install the config and reload nginx**

```bash
sudo cp deploy/nginx/camera.sengycraft.cz.conf /etc/nginx/sites-available/camera.sengycraft.cz
sudo nginx -t
sudo systemctl reload nginx
```
Expected: `nginx: configuration file … test is successful`; reload exit 0.

- [ ] **Step 5: Production smoke**

Run:
```bash
curl -s -o /dev/null -w "landing=%{http_code}\n" https://camera.sengycraft.cz/
curl -s https://camera.sengycraft.cz/ | grep -c "We add the history."
curl -s -o /dev/null -w "deck=%{http_code}\n" https://camera.sengycraft.cz/deck/
curl -s https://camera.sengycraft.cz/group/alpine-summit/summit | grep -o '/widget/assets/index-[A-Za-z0-9_-]*\.js'
curl -s -o /dev/null -w "group=%{http_code}\n" https://camera.sengycraft.cz/group/alpine-summit/summit
curl -s https://camera.sengycraft.cz/group/alpine-summit/summit -o /tmp/opencode/group.html && grep -c 'widget' /tmp/opencode/group.html >/dev/null && echo group-html-ok
curl -s -o /dev/null -w "widget-asset=%{http_code}\n" "https://camera.sengycraft.cz$(curl -s https://camera.sengycraft.cz/group/alpine-summit/summit | grep -o '/widget/assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
curl -s -o /dev/null -w "admin=%{http_code}\n" https://camera.sengycraft.cz/admin/
curl -s -o /dev/null -w "admin-asset=%{http_code}\n" "https://camera.sengycraft.cz/admin/$(curl -s https://camera.sengycraft.cz/admin/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
curl -s https://camera.sengycraft.cz/api/v1/groups/alpine-summit/summit | head -c 120; echo
```
Expected: `landing=200`, grep count ≥ 1, `deck=200`, the widget asset path printed, `group=200`, `group-html-ok`, `widget-asset=200`, `admin=200`, `admin-asset=200`, group JSON body.

If `widget-asset` is not 200, the base/location pairing is wrong — fix Step 1/Step 3, rebuild, reload, re-smoke (do not proceed on a broken embed).

- [ ] **Step 6: Commit**

```bash
git add packages/web/vite.config.ts deploy/nginx/camera.sengycraft.cz.conf
git commit -m "feat(deploy): serve landing/deck at root and move widget SPA to /widget/"
```

---

### Task 5: Deck PDF export + final verification

**Files:**
- Create: `packages/site/scripts/export-deck-pdf.mjs`
- Create (output): `packages/site/dist/deck.pdf` (served as `/deck.pdf`)

**Interfaces:**
- Consumes: Task 4 routing (`/deck/` live), Task 3 screenshots inside `dist/`.
- Produces: `packages/site/dist/deck.pdf`, publicly reachable at `https://camera.sengycraft.cz/deck.pdf`.

- [ ] **Step 1: Create `packages/site/scripts/export-deck-pdf.mjs`**

```js
#!/usr/bin/env node
// Renders the built deck (dist/) to PDF via headless Chromium print-to-PDF.
// Requires `vite preview` running on DECK_BASE (default http://127.0.0.1:8081).

import { chromium } from "playwright";

const DECK_BASE = (process.env.DECK_BASE ?? "http://127.0.0.1:8081").replace(/\/+$/, "");
const out = new URL("../dist/deck.pdf", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${DECK_BASE}/deck/?print-pdf`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.pdf({
  path: out,
  width: "13.333in",
  height: "7.5in",
  printBackground: true,
  pageRanges: "1-12",
});
await browser.close();
console.log(`+ ${out}`);
```

- [ ] **Step 2: Build, serve, export**

```bash
npm run build --workspace @ch/site
(setsid npm run preview --workspace @ch/site > /tmp/opencode/site-preview.log 2>&1 &) ; sleep 3
curl -s -o /dev/null -w "preview=%{http_code}\n" http://127.0.0.1:8081/deck/
npm run deck:pdf --workspace @ch/site
pkill -f "vite preview --port 8081" || true
```
Expected: `preview=200`, then `+ …/dist/deck.pdf`.

- [ ] **Step 3: Verify the PDF file**

Run: `file packages/site/dist/deck.pdf && xxd -l 4 packages/site/dist/deck.pdf && ls -la packages/site/dist/deck.pdf`
Expected: `PDF document`, magic bytes `2550 4446` (`%PDF`), size > 100 KB.

- [ ] **Step 4: Verify the PDF over the production URL**

Run: `curl -s -o /dev/null -w "deck-pdf=%{http_code} type=%{content_type} bytes=%{size_download}\n" https://camera.sengycraft.cz/deck.pdf`
Expected: `deck-pdf=200 type=application/pdf bytes=…` (> 100000).

- [ ] **Step 5: Full gates + final smoke (both are verification, not code)**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: all exit 0; every workspace's tests pass including `@ch/site` (landing + deck).

Then re-run the Task 4 Step 5 smoke block once more at final HEAD and confirm all statuses.

- [ ] **Step 6: Commit**

```bash
git add packages/site/scripts/export-deck-pdf.mjs
git commit -m "feat(site): export deck to pdf for outreach"
```

---

## Self-Review

- **Spec coverage (§3 Fáze 3, §6, §7, §8, §9):** deck at `/deck/` (Task 2) with all 12 slides from §6 incl. embedded live demo and pricing §9 tiers; landing at `/` (Task 1) with hero/features/pricing/demo/contact per §7; PDF export (Task 5); static serving via nginx (Task 4); gates + browser/deck checks + deploy smoke (§8) in Tasks 4–5; demo tenant reuse (§9) via the already-live `alpine-summit/summit` group.
- **Placeholder scan:** no TBD/TODO; all copy, CSS, configs and scripts are concrete; the only conditional note is the Reveal print-CSS path check, which has a named fallback with exact mechanism.
- **Type consistency:** package `@ch/site`; `deck:pdf` and `screenshots` script names used identically in Tasks 1/3/5 and their run commands; `?camera=` unaffected; nginx aliases match the real dist paths (`packages/site/dist`, `packages/web/dist`); asset URL `/widget/assets/…` matches the `base: "/widget/"` change in Task 4.
