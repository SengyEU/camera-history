# Self-serve billing, pilots and landing — implementation plan

**Date:** 2026-11-21
**Trello:** Landing — většina designu; Billing enforcement; Landing — kontaktní formulář (API)
**Status:** implemented, deployed and verified.

## Goal

Make self-serve safe: a new tenant can set up cameras before paying, but captures start only after billing is active or while a pilot is valid. Then make the landing self-serve-first while keeping a guided pilot path.

## Decisions

- Setup is free; captures are gated.
- New tenants default to Starter (3 cameras).
- A package can be preselected from the landing (`?package=plus`).
- Pilots are created through a secret 90-day invite link.
- The contact form is provisional (mailto) until the real API is built.
- The landing keeps `Contact us` as a classic link and makes `Get started` the primary CTA.

## A. Billing gate

- Added `isTenantBillable(state, now)` in `@ch/core`:
  - `active` → billable;
  - `past_due` only while `billingGraceUntil > now`;
  - `isPilot` only while `pilotUntil` is null or in the future;
  - `none`, `unpaid`, `canceled` → not billable.
- `listEnabledCameras(now)` now joins tenants and filters with that helper.
- The worker passes its current `now` into `listEnabledCameras`.
- Camera creation remains allowed before payment; the checkout still requires at least one camera.
- Tests cover none, active, past-due grace, expired grace, unpaid, canceled, pilot active and expired.

## B. Admin

- `/api/v1/admin/tenant` now returns `billingStatus`, `isPilot` and `pilotUntil`.
- Camera list banner:
  - account not activated;
  - past due;
  - unpaid/canceled;
  - pilot active or ended;
  - all cameras used.
- Billing page shows a `none` notice and an ended-pilot notice.
- Removed the dead `res.billing?.checkoutUrl` branch from registration; the API never returned it.
- Disabled buttons are visually disabled.

## C. Pilot invite link

- `PILOT_INVITE_CODE` and `PILOT_DURATION_DAYS` (default 90) in config and compose.
- Register API accepts `pilotCode` and `packageCode`; a valid pilot code creates `isPilot = true` and `pilotUntil = now + duration`.
- Admin register reads `pilot` and `package` from the hash and shows a small note.
- The link is never published on the landing; it is sent manually after a pilot is approved.
- After expiry, captures pause unless the tenant becomes active. Conversion to paid is manual for now.

## D. Landing

- Nav: Live demo, How it works, Features, Pricing, FAQ, Contact us, Sign in, Get started.
- Breakpoint for the mobile menu moved to 960 px so eight items fit.
- Hero: Get started primary, How it works secondary, “Still have questions? Contact us” text link.
- How it works: two cards, self-serve and guided pilot.
- Pricing: per-package Choose buttons with `/admin/#/register?package=...`; Starter primary.
- Contact section (`#contact`): name, email, camera, camera count, message; provisional mailto submit.
- All Contact us links point to `#contact`.
- CTA band: Get started + Contact us; the standalone archive link was removed.
- Mobile menu: solid dark full-width sheet under the header, 48 px rows, divider, Contact us, Sign in, Get started; focus and ARIA fixes.

## E. Verification

- Full gate passes: typecheck, tests, lint, build, design:check.
- Production smoke: pilot registration link, package preselect, none banner, pilot banner, expired pilot banner, camera-limit banner, landing desktop/tablet/phone, mobile menu.
- Temporary screenshot tenants were removed from the production database.

## Notes

- Real contact form API: Trello card “Landing — kontaktní formulář (API)” (16. 12.).
- The pilot code lives only in the deployment environment, not in git.
- The bottom CTA band no longer links to the standalone archive.
