# Camera History — Design System

**Status:** canonical. Tento dokument a `packages/design/tokens.css` jsou jediný zdroj pravdy pro barvy, typografii, spacing, radii a motion. Každá nová UI plocha se musí řídit tímto dokumentem; nové barvy nebo fonty se nejdřív přidají sem a do tokenů.

**Zdroj tokenů:** `packages/design/tokens.css` (CSS), `packages/core/src/themes.ts` a `packages/admin/src/theme.ts` (defaulty custom theme).  
**Kontrola:** `npm run design:check`.

## 1. Principy

- **Montserrat všude** na prvních stranách: landing, deck, admin i widget fallback.
- **Žádný monospace font.** Technické texty (timestampy, ceny, čísla) používají Montserrat s `font-variant-numeric: tabular-nums`, uppercase a letter-spacingem.
- **Jediná výjimka:** widget v iframu dědí font hostitelské stránky, aby splynul s cizím webem. Montserrat je jeho fallback při přímém otevření.
- **Logo, banner, OG image, favicony a screenshoty** jsou obrazové assety; needitují se jako text.
- **Custom theme** je uživatelská data; validuje se na `#rrggbb` a nesmí se používat jako náhrada systémových barev v našem UI.
- **Přístupnost:** text a interaktivní prvky musí mít kontrast ≥ 4,5:1; focus ring je vždy viditelný.

## 2. Typografie

**Font:** `Montserrat Variable` (self-hosted přes `@fontsource-variable/montserrat`), fallback `Montserrat`, `ui-sans-serif`, `system-ui`, `sans-serif`.  
**Váhy:** 400 (body), 500 (labels/technical), 600 (buttons, chips, semibold), 700 (headings), 800 (display/hero).  
**Pravidla:** žádné `font-stretch` (Montserrat nemá width axis); display nadpisy používají `letter-spacing: -0.01em`; technické labely uppercase s `letter-spacing: 0.04–0.08em` a tabular nums.

| Token | Velikost | Použití |
|---|---:|---|
| `--text-2xs` | 10 px | drobné meta, mobilní chipy |
| `--text-xs` | 11 px | OSD chipy, kickery, ceny |
| `--text-sm` | 13 px | helpery, malé labely |
| `--text-base` | 15 px | UI text, navigace, tlačítka |
| `--text-md` | 16 px | body text |
| `--text-lg` | 18 px | lede, větší UI |
| `--text-xl` | 24 px | malé nadpisy |
| `--text-2xl` | 34 px | sekční nadpisy |
| `--text-display` | clamp(40 px, 6vw, 72 px) | hero |

**Line-height:** `--leading-tight: 1.1`, `--leading-snug: 1.25`, `--leading-normal: 1.5`, `--leading-relaxed: 1.65`.  
**Tracking:** `--tracking-tight: -0.01em`, `--tracking-wide: 0.04em`, `--tracking-wider: 0.08em`, `--tracking-widest: 0.14em`.

## 3. Barvy

### 3.1 Core palette

| Token | Hex | Použití |
|---|---|---|
| `--color-snow` | `#f7f9fb` | pozadí first-party stránek |
| `--color-surface` | `#ffffff` | karty, inputy, modaly |
| `--color-ink` | `#101828` | primární text |
| `--color-muted` | `#5b6b7c` | sekundární text, helpery |
| `--color-line` | `#e3e9ef` | rámečky a dělící linky |
| `--color-night` | `#0b1220` | tmavé plochy, OSD podklad |
| `--color-white` | `#ffffff` | text na tmavém/akcentu |
| `--color-on-dark` | `#f1f5f9` | text a chipy na night |
| `--color-glacier-bright` | `#0891b2` | dekorativní hřeben a akcent na tmavém pozadí; **ne pro text na světlém** |
| `--color-glacier` | `#0e7490` | akcent, odkazy, primární akce (kontrast na snow 5,36:1) |
| `--color-glacier-hover` | `#0b5f76` | hover primární akce |
| `--color-glacier-weak` | `#e0f2fe` | jemné akcentní pozadí |
| `--color-pine` | `#15803d` | success/operational |
| `--color-pine-weak` | `#dcfce7` | success pozadí |
| `--color-amber` | `#b45309` | warning/delayed |
| `--color-amber-weak` | `#fef3c7` | warning pozadí |
| `--color-red` | `#b91c1c` | danger/offline |
| `--color-red-dark` | `#991b1b` | danger text na weak |
| `--color-red-weak` | `#fee2e2` | danger pozadí |
| `--color-red-border` | `#f5c2c2` | danger rámeček |

### 3.2 Neutrální doplňky

`--color-slate-50: #f1f5f9`, `--color-slate-100: #e2e8f0`, `--color-slate-400: #94a3b8`, `--color-slate-500: #64748b`, `--color-slate-600: #475569` — používat jen pro tmavé/deck plochy a sekundární text, ne jako novou brand paletu.

### 3.3 Widget themes

Widget používá 9 klíčů: `bg`, `surface`, `ink`, `muted`, `line`, `accent`, `onAccent`, `pine`, `onPine`. Presety jsou v `tokens.css` jako `--theme-{light|dark|forest|midnight}-*`; custom theme dodává uživatel.

| Theme | bg | surface | ink | muted | line | accent | onAccent | pine | onPine |
|---|---|---|---|---|---|---|---|---|---|
| light | `#f8fafb` | `#ffffff` | `#101828` | `#5b6b7c` | `#e3e9ef` | `#0e7490` | `#ffffff` | `#1e7d4e` | `#ffffff` |
| dark | `#0b1220` | `#131c2e` | `#e6ecf5` | `#8b99ad` | `#223046` | `#7fbf9a` | `#0b1220` | `#3f9e6f` | `#06231a` |
| forest | `#0f1a12` | `#16241a` | `#e2efe4` | `#93ad98` | `#24382a` | `#5bbd6e` | `#0f1a12` | `#3f9e6f` | `#06231a` |
| midnight | `#0f172a` | `#1a2436` | `#e6ecf5` | `#93a3b8` | `#2d3a4e` | `#5f8fd6` | `#0f172a` | `#4f9e78` | `#06231a` |

Widget-specific: `--widget-frame-bg: #0a0f1a`, `--widget-warning-border: #f59e0b`, `--widget-warning-bg: #fef3c7`, `--widget-warning-ink: #7c2d12`. Social brand tokens: `--social-facebook: #1877f2`, `--social-x: #0f1419`, `--social-whatsapp: #25d366`, `--social-telegram: #229ed9`, `--social-x-dark: #e7e9ea`. Tyto barvy nejsou součástí Camera History palety, jen funkční/partnerské výjimky.

### 3.4 Deck

Deck používá core palette. Siluety hřebene mají `--deck-ridge-1: #0f1a2e`, `--deck-ridge-2: #13223d`, `--deck-ridge-3: #172a4a`. Jsou to jediné deck-specifické barvy.

### 3.5 Zakázané použití

- `#0891b2` na text nebo malé ikony na světlém pozadí (kontrast 3,48:1). Použij `--color-glacier`; na tmavém pozadí je bright povolený.
- Libovolný monospace font nebo `font-family` mimo tokeny.
- Nové hex hodnoty v první-party CSS. Přidej token, dokumentuj ho a použij `var(--...)`.
- Barvy z custom theme jako barvy našeho UI.

## 4. Spacing, radii, layout

**Spacing:** 4, 8, 12, 16, 24, 32, 48, 64, 96 px (`--space-1`…`--space-9`).  
**Radii:** `--radius-xs: 4px`, `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 10px` (karty), `--radius-xl: 12px`, `--radius-2xl: 16px`, `--radius-pill: 999px`.  
**Layout:** `--maxw-site: 1080px`, `--maxw-admin: 1240px`, `--maxw-widget: 1000px`.  
**Shadows:** `--shadow-xs`, `--shadow-card`, `--shadow-pop`; stíny používat minimálně.

## 5. Motion

`--dur-fast: 200ms`, `--dur-med: 420ms`, `--dur-slow: 560ms`, `--dur-frame: 900ms`; `--ease-out: cubic-bezier(0.22,1,0.36,1)`, `--ease-in: cubic-bezier(0.4,0,1,1)`. Respektovat `prefers-reduced-motion` (widget i admin už mají globální vypnutí).

## 6. Komponenty

- **Buttons:** primární glacier/on-accent, sekundární surface/line, danger red; radius `--radius-md`; focus ring 2px accent.
- **Inputs/selects:** surface, line border, radius `--radius-md`; label nad polem; helper `--text-sm` muted.
- **Cards:** surface, 1px line, `--radius-lg`, `--shadow-xs`/`--shadow-card`.
- **Chips/OSD:** Montserrat 11px, uppercase, tracking 0.08em, tabular nums, night background 72 %, radius 6px.
- **Status pills:** pine/amber/red text, weak background, pill radius.
- **Tables:** hlavičky uppercase, ceny/čísla tabular nums, řádkové hlavičky pro retention.
- **Modaly:** surface, `--radius-xl`, `--shadow-pop`, overlay rgba(11,18,32,0.45).
- **Embed panel:** `<pre>` se snippetem, surface, line, radius 8; copy feedback.
- **Widget:** theme-aware; host font; 16:9 strip; OSD chips; focus ring accent.

## 7. Přehled povrchů

- **Landing** `/`: Montserrat, core palette, inline ridge s `--color-glacier-bright`, OG/favicony.
- **Deck** `/deck/`: Montserrat, core palette, deck ridge tokens; noindex.
- **Admin** `/admin/`: Montserrat, core palette, dense UI, technical text tabular nums.
- **Widget** `/widget/`, `/group/`: host font (výjimka), Montserrat fallback; theme palettes; noindex.
- **Dema** `/demo/`: odstraněna; nginx vrací 410. Nevytvářet nové demo stránky bez rozhodnutí.
- **Assety:** logo/banner/OG/favicony jsou obrazové; nemění se textovým fontem.

## 8. Governance

1. Novou barvu/font/velikost nejdřív přidej do `packages/design/tokens.css` a do tabulky v tomto dokumentu.
2. Použij `var(--token)`, nikdy literál.
3. Spusť `npm run design:check`; musí projít spolu s typecheck/test/lint/build.
4. Výjimky (widget host font, custom theme, sociální sítě, deck ridge) musí být uvedené zde.
5. Při změně vzhledu aktualizuj screenshoty v `packages/site/public/` a regeneruj deck PDF.
