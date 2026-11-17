# Camera History — agent instructions

## Design system

- Canonical source: `docs/design-system.md` and `packages/design/tokens.css`.
- Every new UI must use `@ch/design` tokens. Do not add new fonts or hardcoded colours without updating the design doc and tokens.
- Montserrat is the only first-party font. The embedded widget intentionally inherits the host page font; Montserrat is its fallback.
- Run `npm run design:check` as part of the normal verification gates.

## Verification

`npm run typecheck && npm test && npm run lint && npm run build && npm run design:check`

## Roadmap & GTM

- Task tracking and sequencing live in the private Trello board `Camera History — 90 % do 31. 1. 2027`; ask the user for access. The board is the single source of truth for task status.
- Do not use `docs/roadmap.md` for sequencing; it is archived historical context.
- Do not add paid ads or developer/startup launch sites without explicit approval.
- Current GTM: 10–20 pilot design partners and direct outreach to camera operators; niche communities only.
- Domain migration to `camera-history.com` is a pre-launch gate; follow `docs/domain-migration.md`.
