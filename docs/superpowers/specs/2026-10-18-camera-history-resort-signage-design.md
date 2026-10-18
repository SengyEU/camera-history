# Camera History — „Resort signage" design rework — Design

**Datum:** 2026-10-18
**Stav:** schváleno (brainstorming + volba směru A1), připraveno k implementačnímu plánu
**Navazuje na:** `2026-10-17-camera-history-gtm-demo-deck-design.md` (§5 vizuální směr „Alpine clean")
**Skilly:** frontend-design (brainstorm → tokeny → kritika → build → screenshot kritika)

## 1. Cíl

Přepracovat všechny čtyři vizuální povrchy produktu do jednotného, osobitého a maximálně
uživatelsky přívětivého systému. Nejde o nové funkce — jde o typografii, hierarchii, ovládání,
stavy (loading/empty/error/focus) a vizuální identitu ukotvenou ve světě produktu.

**Success criteria:**
- Žádný povrch nepůsobí genericky (systémový font + default ovládací prvky).
- Všechny existující vitest suite zůstávají zelené (`data-testid` a pinovaná copy se nemění).
- Vizuální QA screenshotem po každém povrchu (controller čte obrázky).
- Gates (`typecheck`/`test`/`lint`/`build`) zelené; deck PDF na konci regenerováno.

## 2. Směr: „Resort signage"

Design vychází z orientačního systému horských středisek (sjezdovkové/cestní značení) a z
vernacular produktu: **webkamerový OSD timestamp** (mono, kapitálky, tmavý poloprůhledný čip)
je jednou signaturou sdílenou všemi povrchy.

### 2.1 Sdílené tokeny

| Token | Hodnota | Použití |
|---|---|---|
| `--snow` | `#f7f9fb` | pozadí stránek |
| `--surface` | `#ffffff` | karty, tabulky, modaly |
| `--ink` | `#101828` | primární text |
| `--muted` | `#5b6b7c` | sekundární text |
| `--line` | `#e3e9ef` | rámečky, dělící linky |
| `--glacier` | `#0891b2` | akcent, primární akce, focus ring |
| `--glacier-deep` | `#0e7490` | hover |
| `--night` | `#0b1220` | tmavé pasáže (deck hero/CTA, OSD čip podklad) |
| `--pine` | `#15803d` | status `operational` / pozitivní |
| `--amber` | `#b45309` | status `delayed` / varování |
| `--red` | `#b91c1c` | status `offline` / destruktivní akce |

Radius 10px (karty) / 999px (čipy, pilulky). Stíny minimální. Focus ring: 2px `--glacier`,
viditelný na klávesnici všude.

### 2.2 Typografie

- **Archivo Variable** (`@fontsource-variable/archivo`) — nadpisy i UI text; display řezy s
  širší šířkou (`font-variation-settings` / `font-stretch: expanded`) pro hero a velké nadpisy.
- **IBM Plex Mono** 400/500/600 (`@fontsource/ibm-plex-mono`) — timestampy, eyebrow, ceny,
  čísla slidů, technické štítky.
- Self-hosted přes npm (žádný Google Fonts CDN; GDPR-safe). Do adminu i site; **widget bez
  vlastních fontů** (vkládá se do cizích webů) — použije systémový mono stack
  (`ui-monospace, "SF Mono", Menlo, Consolas, monospace`).

### 2.3 Signatura: OSD timestamp čip

`.ts-chip`: IBM Plex Mono (resp. systémový mono ve widgetu), 11–12px, uppercase,
`letter-spacing 0.08em`, podklad `rgba(11,18,32,0.72)`, text `#f1f5f9`, radius 6px,
padding 2px 8px. Použití:
- widget: caption každého snímku překrytá přes levý dolík roh obrázku,
- admin: „Last capture" hodnoty v tabulce,
- landing: eyebrow nad hero nadpisem (`LIVE — ALPINE SUMMIT`), ceny v tabulce,
- deck: čísla slidů (`01/12`), eyebrow, popisky screenshotů.

## 3. Landing (`packages/site`)

- **Hero dvousloupcový:** vlevo OSD eyebrow čip `LIVE — ALPINE SUMMIT`, headline Archivo
  Expanded 800 (clamp do ~72px), lede, CTA (primární glacier „See the live demo", ghost
  „Get in touch"); vpravo živý widget `/group/alpine-summit/summit` v „kamerovém rámu"
  (radius, 1px bezel, OSD čip `LIVE` v rohu rámu).
- Hero pozadí: decentní inline SVG linie hřebene (stroke glacier, nízká opacita) — jediné
  vizuálně riskantní gesto; žádné třetí-party fotografie.
- „Problem": 3 karty beze změny copy.
- „Solution": kroky 1-2-3 s mono čísly v čipech (skutečná sekvence).
- Demo sekce: plná šířka rámu + OSD čip; odkaz na novou kartu zachován.
- Features: 6 karet, každá s mono štítkem (FEED TYPES, THEMES, RETENTION, GROUPS, SHARE, EMBED).
- Pricing: tabulka, ceny Plex Mono, řádek `12 months €29` zvýrazněn čipem `MOST POPULAR`;
  všechny 7 řádků přesně dle `packages/core/src/billing.ts`.
- Audiences/Why/CTA band/footer: copy zachována, nová typografie.
- Odstranit zbývající „faux-link" nekonzistence; `target="_blank"` ponechat kde je.

## 4. Deck (`packages/site/deck`)

- Stejné tokeny; slidy vertikálně centrované, obsah maxWidth ~1100px, h2 ~1.9em.
- OSD číslo slidu vpravo nahoře (mono `01/12` … `12/12`) — čísla nesou informaci o pozici.
- Tmavé slidy (1, 12): SVG silueta hřebene dole, obsah vícetělový; odtud „hybrid" §5.
- Slidy s výčty (2, 3, 8, 10, 11): dvousloupec / větší řez, aby zmizela prázdná místa.
- Slide 4: demo iframe zvětšen (960×540), OSD čip `LIVE`.
- Slide 5: flow tři kroky s mono čísly a šipkami, větší.
- Slidy 7/8: screenshoty s OSD popiskem pod (`ADMIN — CAMERAS`, `ADMIN — GROUPS`).
- Slide 9: pricing tabulka Plex Mono, řádek 12 months zvýrazněn.
- Reveal `transition: "fade"`; `?print-pdf` zachováno; PDF regenerováno na konci.

## 5. Admin (`packages/admin`)

- **Login/Register:** karta (surface, radius, jemný stín) na `--snow` pozadí; brand
  „Camera History" + OSD čip `ADMIN`; labely nad poli, helper text (slug, heslo), focus
  ringy, error stavy pod polem; `data-testid` beze změny.
- **App shell:** topbar s brandem, nav s aktivním stavem (podtržení glacier), max-width
  obsahu, `Sign out` sekundární.
- **Cameras tabulka:** status pilulky (pine/amber/red dle statusu), Last capture jako OSD
  čip, náhled větší, row hover, `+ New camera` primární; prázdný stav s přímým CTA.
- **Groups:** karty (name + mono slug + počet kamer), checkboxy členů, embed snippet v
  rámu s OSD čipem `EMBED`, tlačítka Rename/Delete sekundární/danger.
- **CameraForm modal:** labely nad poli, helper text, danger zóna pro Delete; všechna
  `data-testid` zachována.
- **Nové UX:** potvrzení mazání skupiny (modal `Delete group „X"? …` — dříve odložený
  Minor), srozumitelné chyby u akcí.
- **Billing (`Billing.tsx`):** karty/tierny do stejného systému, ceny Plex Mono.

## 6. Widget (`packages/web`) — jemně, neutrálně

- Zůstávají 4 témata (`light/dark/forest/midnight`) přes `data-theme` CSS proměnné; žádné
  vlastní fonty (systémový mono pro razítka).
- Header: název skupiny/kamery jako silný text (ne modrá „faux link"), vlastní styl
  `<select>` a `<input type=date>` (theme-aware), tlačítka ±den ≥36px dotykové plochy.
- Grid: snímek s OSD timestamp čipem přes levý dolík roh (místo caption pod), hover
  (jemný scale + ring), `focus-visible` ring, loading skeleton shimmer, prázdný stav se
  zprávou `"No images for this date."` (copy zachována) a nápovědou k datumu.
- Modal: větší close, kopírování s potvrzením „Copied", `alt` texty.
- Všechny `data-testid` zachovány; žádná copy změna pinovaná testy.

## 7. Testy a QA

- Všechny existující vitest testy musí zůstat zelené bez změn (kromě: pokud test pinuje
  CSS-chované chování — nemá; případné doplnění testů na nové chování je dovoleno, ale
  nemění pinovanou copy/testids).
- Vizuální QA: po každém povrchu playwright screenshoty (landing hero, deck hero + obsahový
  slide + print-pdf, admin login/dashboard/groups/billing, widget den/noc), controller je
  čte a schvaluje; nedostatky se opravují v dalším kole.
- Gates: `npm run typecheck && npm test && npm run lint && npm run build` zelené.
- Deploy: site/web/admin rebuild + regenerace `deck.pdf` + produkční smoke (landing/deck/
  group/admin/api 200) na konci.

## 8. Mimo rozsah

- Nové produktové funkce, i18n, white-label, změna názvů témat widgetu, změna ceníkových
  hodnot, změna API/API kontraktů.
