# Widget Motion Design

Status: approved (2026-10-19)
Scope: `packages/web` — all widget transitions unified into one calm, premium motion system.

## Goals

- No blink, no height jump, no double animation on day/camera switch.
- Old content stays visible until new data is preloaded, then swaps atomically.
- One consistent motion language across: day/camera hand-off, frame expand/collapse,
  capture step inside an open frame, share popup, controls.
- Reduced motion users get instant swaps everywhere.

## Content hand-off (day / camera switch)

- New component `ContentTransition` wraps the filmstrip/empty-state branches in `WidgetBody`.
- Props: `transitionKey`, `direction: "next" | "prev"`, `children`, `animate?`.
- On key change the previous content is frozen into a non-interactive layer
  (`aria-hidden`, `pointer-events: none`) and the new content renders live beneath it.
  The old layer is removed after 400 ms (settle > animation length).
- Rapid switches replace the pending old layer — never more than two layers.
- The key is `cameraId|firstImageId|imageCount`, so it only changes once the new images
  actually arrive (`preloadImages` → `setImages`). While the fetch is pending the old
  strip stays and no transition starts.
- The loading skeleton renders outside `ContentTransition` and never animates (no
  slide-in offset). The first content mount is instant (no hand-off from nothing).
- The wrapper exposes `data-direction` for tests and debugging.
- Direction is decided at intent time: `changeDate` compares the new date with the
  current one (`prev` = older, `next` = newer); camera switch and group-latest fallback
  use `next`. The direction is frozen per transition inside `ContentTransition`.
- Reduced motion and test runs swap instantly (JS check + `prefers-reduced-motion` CSS).

### Motion

- 520 ms, `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-out`), translateX only (±28 px),
  `will-change: transform` while sliding. Settle timer 640 ms.
- `prev`: new content enters from the left, old slides out right (timeline going back).
- `next`: new content enters from the right, old slides out left.
- Both layers are fully opaque and overlap at all times — no gap, no fade to background.
- CSS grid stacking (`grid-area: 1 / 1`) keeps the height constant; empty states keep
  the same 4/3 box, so the widget never reflows.

## Frame expand / collapse

- Flex transition 560 ms `--ease-out`.
- OSD chip, arrows and share button animate in with 80 ms stagger, 220 ms
  fade + slight scale. Collapse is instant (elements unmount).

## Capture step inside an open frame

- The open frame's `<img>` is keyed by image id; it remounts with a 220 ms fade-in
  (arrows/swipe/keyboard). No gap during the swap.

## Share popup

- Popup: 280 ms `--ease-out`, scale from 0.96.
- Overlay: 220 ms fade. Close: 180/160 ms.

## Controls

- Unified hover/focus transitions 180 ms (`--dur-fast`).
- `:active` scale 0.97 on buttons (arrows, share, date nav, popup controls).
- Skeleton shimmer unchanged.

## Tokens

```css
:root {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --dur-fast: 180ms;
  --dur-med: 520ms;
}
```

## Reduced motion

- `@media (prefers-reduced-motion: reduce)` disables all new animations and
  `ContentTransition` swaps instantly (JS `matchMedia` check at mount).

## Testing

- Unit tests for `ContentTransition` (fake timers): two layers during a transition,
  frozen old layer is `aria-hidden`, old layer removed after settle, direction classes
  (`content-enter-prev/next`, `content-exit-prev/next`), rapid switch never exceeds two
  layers, reduced motion swaps instantly, default instant swap in test runs.
- App behavior tests: old strip remains visible while a date fetch is pending and
  swaps once images resolve; direction intent is set correctly for prev/next and
  camera switch. Existing 64 web tests must stay green.
- Visual QA: Chromium screenshots of mid-transition frames (Playwright e2e cannot run
  on this host).
