# M5 — Widget themes: presetové styly widgetu per kamera + `?theme=` v embed kódu

> Status: schváleno uživatelem (2026-09-24)
> Navazuje na: hlavní design doc `docs/superpowers/specs/2026-09-18-camera-history-saas-design.md` (§7 Widget témata, §15 milníky, M5)

## 1. Rozhodnutí (z brainstormingového dialogu)

- **Presetové témata (whitelist, žádná customizace):** `light` (default), `dark`, `forest`, `midnight`.
- **Precedence:** `?theme=` (pokud je v whitelistu) > `cameras.theme` (pokud validní) > `light`. Neznámé `?theme=` → fallback na `cameras.theme`.
- **Implementace widgetu:** přístup A — CSS custom properties (design tokeny) + `data-theme` atribut na kořeni `.widget`; bez separátních stylesheetů a bez inline-style objektů.
- **WP plugin:** beze změny — shortcode `theme="…"` atribut už funguje (pass-through `?theme=`), widget si neznámé hodnoty sám vyřeší.
- **Správa tématu:** per kamera v adminu (dropdown v `CameraForm` při vytvoření i úpravě).
- **Mimo rozsah:** white-label branding, vlastní logo, volná customizace barev (podle hlavního design doc §16).

## 2. Stack a klíčová rozhodnutí

- Žádná DB migrace — `cameras.theme text NOT NULL DEFAULT 'light'` už existuje od M1 (migrace 0000), `PublicCamera.theme` už API vrací.
- **Whitelist žije na třech místech** (konvence repo — web/admin nepoužívají `@ch/core`):
  - `packages/core/src/themes.ts`: `THEMES: string[]` + `isValidTheme(theme)` — zdroj pravdy pro **API validaci** (+ unit testy).
  - `packages/web` lokální konstanta pro filtrování `?theme=` (fallback logika).
  - `packages/admin` lokální `THEMES` + `THEME_LABELS` pro dropdown.
- **API je validátorem** (administrace volá API; admin form odešle jen whitelist hodnoty).
- Widget: téma → `data-theme` atribut → CSS proměnné (jednotný design token set v `App.css`).

## 3. Datový model

Beze změn schématu.

`cameras.theme` — řetězec z whitelistu, persistovaný v DB; vracen v `PublicCamera` a `AdminCamera`.

## 4. Téma: sémantika a design tokeny

Widget používá sadu CSS proměnných; každé téma je plný přepis tokenů (žádná dědičnost mezi presety):

| token | light | dark | forest | midnight |
|---|---|---|---|---|
| `--bg` (pozadí widgetu) | `#fff` | `#1c1c1e` | `#f3f6ef` | `#10131a` |
| `--surface` (buňky/modal) | `#fff` | `#2c2c2e` | `#e9efe1` | `#1b2230` |
| `--text` | `#111` | `#eee` | `#1c2b17` | `#e6ecf5` |
| `--muted` (sekundární text) | `#555` | `#aaa` | `#4a6040` | `#93a3b8` |
| `--border` | `#ddd` | `#444` | `#c3d0b6` | `#2d3a4e` |
| `--accent` (fokus/loader) | `#2f6f4f` | `#7fbf9a` | `#3e7a4c` | `#5f8fd6` |

Existující pravidla (`App.css`) se přepíšou na tyto proměnné. Modal overlay zůstává `rgba(0,0,0,.6)`.

## 5. Datové toky

1. **Render widgetu:** `App` načte `getCamera(cameraId)` (má `theme`). Souběžně přečte `?theme=` z `window.location.search`.
   - `resolveTheme(queryTheme, cameraTheme)`: queryTheme pokud `isValidTheme` → jinak cameraTheme pokud validní → jinak `"light"`.
2. **Wrapper:** `<div className="widget" data-theme={theme}>`; styling přes `[data-theme="dark"] { …token overrides… }`.
3. **Sdílený odkaz** (`buildShareUrl`): při zachování tématu se do share URL přidá `?theme=` (aktuálně použitý) — konzistentní embed.
4. **API (create/update kamery):** `theme` volitelné pole; pokud přítomno a nevalidní → `400 bad_request` („theme must be one of light, dark, forest, midnight"); při create default `light`.

## 6. API

### Veřejné (bez změny chování)

- `GET /api/v1/cameras/:cameraId` — vrací `theme` (již teď).

### Admin (změna)

- `POST /api/v1/admin/cameras` — nově volitelné `theme`; validováno proti `isValidTheme`; default `light`.
- `PUT /api/v1/admin/cameras/:id` — nově `theme` v akceptovaném patch whitelistu (spolu s name/feedType/...); validováno proti whitelistu, jinak 400.

## 7. Frontend — widget (`packages/web`)

- `api.ts`: beze změny (PublicCamera už má `theme`).
- `App.tsx`:
  - nový `resolveTheme(query: URLSearchParams, cameraTheme: string | undefined): string`
  - lokální `THEMES` whitelist (light/dark/forest/midnight)
  - kořen renderuje `<div className="widget" data-theme={theme}>`
  - `buildShareUrl` přidá `?theme=` aktuálního témata.
- `App.css`: refaktor na CSS proměnné + `[data-theme=…]` token overrides (light výchozí).

## 8. Frontend — admin (`packages/admin`)

- `api.ts`: `AdminCamera` + `theme: string` (API už vrací), `CameraInput` + `theme: string`; `THEMES` + `THEME_LABELS` (Světlé / Tmavé / Lesní / Půlnoc).
- `CameraForm`: nový `<select data-testid="form-theme">` mezi Feed URL a Intervalem; povinná hodnota (default `light`).
- `App.tsx`: `emptyInput` → `theme: "light"`; `toInput` → přidá `theme`.

## 9. WordPress plugin

Beze změny (atribut `theme` shortcode už přidává `?theme=`; widget filtruje).

## 10. Testy

- **`@ch/core`** `test/themes.test.ts`: `THEMES` = 4 presety; `isValidTheme` true/false.
- **`@ch/api`** `test/admin.test.ts` rozšířit: create s `theme:"dark"` OK; create s nevalidním `theme` → 400; update theme → uloží.
- **`@ch/web`** `src/test/App.test.tsx` rozšířit: default light z kamery (`data-theme="light"`), `?theme=dark` override (`data-theme="dark"`), neznámé `?theme` → fallback na `cameras.theme`, share URL obsahuje `theme`.
- **`@ch/admin`** `App.test.tsx` rozšířit: dropdown `form-theme`, výběr tématu uloží (create → `api.createCamera` s `theme`).

## 11. Definition of Done

- Whitelist `light/dark/forest/midnight` v core, API validace create/update.
- Widget renderuje `data-theme` a používá CSS proměnné pro všechna 4 témata; `?theme=` override a fallback funguje.
- Admin dropdown per kamera (create/edit) s českými popisky.
- Testy výše PASS; repo gaty (`typecheck`, `test`, `lint`, `build`) PASS; 6 workspace balíčků beze změny.
- Žádná DB migrace, WP plugin beze změny.