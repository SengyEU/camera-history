# Landing hero — implementation plan

**Date:** 2026-11-20
**Trello:** Landing — většina designu (25. 11.)
**Scope:** Hero, navigation labels/anchors, the `How it works` section anchor, and landing tests. No final visual polish; that belongs to the 9. 12. card.

## Goal

Make the hero carry one clear message and one clear demo, without duplicated links or fake chrome:

- Desktop: one full-height hero, copy left, live demo right.
- Phone: two full screens — pitch first, demo second.
- The demo is the proof; the page does not link out to a separate archive from the hero.
- `How it works` becomes a real nav item and its own anchored section.

## Final decisions

### Navigation

Desktop and mobile menu, in this order:

1. Live demo → `#hero-demo`
2. How it works → `#how-it-works`
3. Features → `#features`
4. Pricing → `#pricing`
5. FAQ → `#faq`
6. Sign in → `/admin/`
7. Contact us → `mailto:hello@sengycraft.cz`

- `Talk to us` becomes `Contact us` everywhere: desktop nav, mobile menu, bottom CTA band.
- Footer keeps `Live demo` first, then adds `How it works`.
- Because the nav grows to seven items, the mobile menu breakpoint moves from 720 px to 840 px and the header height becomes a local `--header-h` variable.

### Hero CTAs

- Primary: `How it works` → `#how-it-works`.
- Secondary: `Contact us` → `mailto:hello@sengycraft.cz`.
- Phone-only text link below the buttons: `See the demo ↓` → `#hero-demo`.
- Remove the hero links `Open the live archive` and `Open full archive`.
- The bottom CTA band stays untouched for now except for the `Contact us` label.

### Hero layout

- Desktop (> 960 px): `min-height: calc(100dvh - var(--header-h))`, copy left, demo right, both vertically centred.
- Tablet (721–960 px): one column, natural stacking, at least one viewport tall.
- Phone (≤ 720 px): two panels, each `calc(100dvh - var(--header-h))` tall.
  - Panel 1: headline, lede, two stacked full-width buttons, `See the demo ↓` pinned to the bottom.
  - Panel 2: `LIVE DEMO` bar plus the widget, vertically centred.
  - Ridge background only on panel 1.
- Remove the `Install / History / Feeds` proof block.

### Demo widget

- Stays right on desktop, becomes panel 2 on phone.
- Desktop: about half the content width and most of the hero height, targeting roughly 30–40 % of the hero's visual area.
- Phone: full width, iframe roughly 600 px tall.
- Top bar: only the `LIVE DEMO` chip. Remove the green dot, `LIVE — ALPINE SUMMIT`, and `Alpine Summit / Summit`.
- Remove the bottom strip `Three cameras, one archive.` / `Open full archive`.
- Keep the iframe interior unchanged.
- Add `loading="lazy"` so the phone's first screen is not blocked by the widget.

### How it works section

- Give the existing steps section `id="how-it-works"`.
- Add a small `HOW IT WORKS` kicker above the current heading.
- Keep the current heading, copy, and three steps; deeper work comes later.

## Files

- `packages/site/index.html`
- `packages/site/src/site.css`
- `packages/site/test/landing.test.ts`
- `docs/superpowers/plans/2026-11-20-landing-hero.md` (this file)

## Steps

1. Update the navigation in `index.html`:
   - new order, `Contact us`, `#hero-demo`, `#how-it-works`, footer link.
2. Update the hero markup:
   - remove the proof block;
   - new CTA pair;
   - add the phone scroll cue;
   - slim the demo bar to `LIVE DEMO`;
   - remove the demo footer;
   - add `id="hero-demo"` and `loading="lazy"`.
3. Update the `How it works` section:
   - add the id and kicker.
4. Update `site.css`:
   - header variable and 840 px nav breakpoint;
   - desktop hero height/padding, grid ratio, widget sizing;
   - phone two-panel layout and scroll cue;
   - remove proof, status dot, demo path, demo footer and `breathe` keyframes.
5. Update `landing.test.ts`:
   - `LIVE DEMO` instead of `LIVE — ALPINE SUMMIT`;
   - iframe `src` stays, hero archive `href` goes away;
   - `How it works` anchor and section id;
   - `Contact us` present, `Talk to us` absent.
6. Run the checks and inspect 1440 px and 390 px.

## Verification

```bash
npm run build --workspace @ch/site
npx vitest run packages/site
npm run design:check
```

Then the full gate from `AGENTS.md`:

```bash
npm run typecheck && npm test && npm run lint && npm run build && npm run design:check
```

Visual checks:

- 1440 × 900: hero fits one screen, widget reads as ~30–40 % of the area, no horizontal overflow.
- 390 × 844: two panels, buttons stacked, scroll cue visible, widget fits panel 2.
- Keyboard: skip link, nav, both hero CTAs, scroll cue, widget iframe.
- Anchor jumps land below the sticky header.

## Status

Implemented 2026-11-20. The full gate passes. Production is updated because nginx serves `packages/site/dist` directly.

Measured on production:

- Desktop 1440 × 900: hero 828 px tall, widget 553 × 464 px (38 % of the hero width).
- Phone 390 × 844: two 780 px panels, widget 358 × 354 px.
- The widget's height comes from the widget page through `embed.js`; the CSS height is only a fallback. Making the iframe taller in CSS would not enlarge the widget content, only add empty space.
- The two-screen phone layout leaves deliberate empty space around the demo in panel 2.

## Notes

- Do not buy or switch the domain here; canonical URLs stay on `camera.sengycraft.cz`.
- Do not add legal links to the footer; that belongs to the `Právo na webu` card.
- The bottom CTA band still links to the standalone archive; decide that when we work on the band.
