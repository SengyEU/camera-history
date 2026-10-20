# Camera History — agent instructions

## Design system

- Canonical source: `docs/design-system.md` and `packages/design/tokens.css`.
- Every new UI must use `@ch/design` tokens. Do not add new fonts or hardcoded colours without updating the design doc and tokens.
- Montserrat is the only first-party font. The embedded widget intentionally inherits the host page font; Montserrat is its fallback.
- Run `npm run design:check` as part of the normal verification gates.

## Verification

`npm run typecheck && npm test && npm run lint && npm run build && npm run design:check`
