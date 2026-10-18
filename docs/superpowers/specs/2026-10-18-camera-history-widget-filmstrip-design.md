# Widget filmstrip (port Box.js) + daylight capture — Design

**Datum:** 2026-10-18
**Stav:** schváleno (brainstorming), připraveno k implementačnímu plánu
**Navazuje na:** `2026-09-18-camera-history-saas-design.md` §10 („Port Box.js"), legacy `legacy/src/Box.js` (referenční implementace)
**Skilly:** brainstorming → writing-plans → subagent-driven-development

## 1. Cíl a kontext

Widget byl postaven jako mřížka thumbnails + modal — to **není** port Box.js, který spec §10 vyžaduje
(„Port Box.js: date picker, časová osa snímků, sdílení (FB/X/WhatsApp/Telegram), navigace šipkami,
URL parametry `?date=&hour=`"). Tento design vrací widgetu jeho zamýšlenou podobu — **filmstrip dne** —
a doplňuje dvě věci, které z ní vyplývají: hodinový capture (aby pás fungoval jako v legacy) a
day/night vrstvu (sunrise/sunset dle souřadnic + přepínač zobrazení nočních snímků).

**Success criteria:**
- Widget: celý den jako vodorovný pás; klik na snímek = roztažení in-place + ‹ › scrub; share popup se
  sítěmi FB/X/WhatsApp/Telegram; deep-linky `?date=&hour=` (+ zpětně kompatibilní `?img=`).
- Noční snímky: příznak `isDaylight` počítá **API** (jeden zdroj pravdy, `@ch/core.sunTimes`); widget
  defaultně noc skrývá, toggle „Night images" ji zobrazí; bez souřadnic fallback okno 20:00–06:00 lokálně.
- Capture: možnost **`daylight_only`** per kamera (worker snímá jen mezi sunrise a sunset dle souřadnic).
- Demo: kamery na **60min intervalu**, 24h capture (dle rozhodnutí uživatele), souřadnice vyplněné.
- Všechny existující gates zelené; widget/API/admin testy aktualizované dle nového chování.

## 2. Klíčová rozhodnutí

| Oblast | Rozhodnutí |
|---|---|
| Pás | Filmstrip: všechny snímky dne vedle sebe (flex slzy); s >28 snímky min-šířka slzy + h-scroll |
| Expanda | In-place (flex `1 1 97%`), uvnitř ‹ › scrub + share; ostatní slzy se smrsknou |
| Share | Popup: titulek `{date} · {hour}` (viewer-local, jako legacy), FB/X/WhatsApp/Telegram (blank), copy pole + „Copied" |
| Deep linky | `?date=YYYY-MM-DD&hour=H` (viewer-local hodina, jako legacy) + `?img=<id>` (zpětná kompatibilita) |
| Noc | `isDaylight` per snímek z API; toggle v hlavičce, **default skrytá**; prázdný den jen kvůli filtru → inline akce „Show night images" |
| Definice noci | Souřadnice kamery → sunrise/sunset pro datum snímku (`@ch/core.sunTimes`, NOAA); bez souřadnic → okno 20:00–06:00 v tz kamery; polární výjimky (null) → fallback okno |
| Daylight capture | `cameras.daylight_only` (default false); worker okno = sunrise→sunset (ignoruje activeFrom/To); vyžaduje souřadnice (validace API + admin UI) |
| Souřadnice | `cameras.latitude/longitude` (nullable, double precision); admin volitelná pole s validací −90..90 / −180..180 |
| Demo | interval 60 min + souřadnice (Lake Louise 51.425, −116.177; KiteSport 53.350, −6.267); daylight_only vypnuto; seeder umí i PUT aktualizaci existujících kamer |
| Témata | 4 témata zachována; widget bez brand fontů, OSD čipy zůstávají |

## 3. Datový model a migrace

Migrace `0004` (drizzle-kit):
```sql
ALTER TABLE cameras ADD COLUMN latitude double precision;
ALTER TABLE cameras ADD COLUMN longitude double precision;
ALTER TABLE cameras ADD COLUMN daylight_only boolean NOT NULL DEFAULT false;
```
Core typy (`packages/core/src/types.ts`): `Camera` + `latitude: number | null`, `longitude: number | null`,
`daylightOnly: boolean`; `NewCamera`/`UpdateCamera` analogicky (volitelné).
`PublicCamera` + `latitude/longitude` (potřebuje API pro výpočet `isDaylight`).

## 4. Solární výpočet (`packages/core/src/sun.ts`)

```ts
export interface SunTimes { sunrise: Date; sunset: Date }
export function sunTimes(dateLocal: string, tz: string, lat: number, lon: number): SunTimes | null
```
- NOAA/Meeus aproximace (bez závislostí), vstup: lokální datum (YYYY-MM-DD) + tz + souřadnice,
  výstup: UTC instanty sunrise/sunset pro daný lokální den; `null` pro polární den/noc (slunce
  nevychází/zapadá) a pro neplatné vstupy.
- Testy: Praha letní/zimní den, Lake Louise, rovník, polární případ (Tromsø midsummer → null), vs. referenční hodnoty ±2 min.

## 5. API

**`GET /api/v1/cameras/:id/images?date=`** — response `images[]` dostane `isDaylight: boolean`:
- kamera má souřadnice → `timestamp ∈ [sunrise, sunset]` pro datum snímku (počítáno 1× per request přes `sunTimes`)
- bez souřadnic → fallback: lokální hodina (tz kamery) mimo 20:00–06:00 (okno `<= 20:00 <` atd. — přesná
  definice: `isDaylight = localHour >= 6 && localHour < 20`; okraj: přesně 20:00 = night)
- `sunTimes` null (polární) → fallback okno

**Admin API** (`POST/PUT /api/v1/admin/cameras`): přijímá `latitude`, `longitude`, `daylightOnly`;
validace: lat/lon čísla v rozsahu nebo null; `daylightOnly === true` vyžaduje obě souřadnice →
`400 bad_request` s konkrétní hláškou.

## 6. Worker

`packages/worker/src/schedule.ts`:
- nová funkce `isInDaylightWindow(cam, now)` — `sunTimes(localDate(now, cam.timezone), cam.timezone, lat, lon)`,
  `null` → fallback na `isInActiveWindow`; jinak `sunrise <= now <= sunset`.
- `isCaptureDue`: když `cam.daylightOnly && coords`, použij daylight okno (místo active window);
  jinak stávající logika. `enabled` a interval platí vždy.
- Testy: due/not-due uvnitř/venku okna, daylight_only bez souřadnic = chová se jako vypnuté (active window),
  polární fallback.

## 7. Admin UI

`CameraForm` (sekce „Location & schedule"):
- `Latitude` / `Longitude` — number inputy (volitelné, krok 0.001), hint „Used to filter day/night images"
- checkbox **„Capture only during daylight"** + hint „Requires latitude and longitude. The camera's active window is ignored while enabled."
- validace na klientu (rozsahy; daylight bez souřadnic → inline error) + server vrací 400 s detailem
- `CameraInput` typ + `toInput` rozšířeny; žádný testid nezměněn, nové `form-latitude`, `form-longitude`, `form-daylight-only`

## 8. Widget (`packages/web`) — přestavba

Struktura (nahrazuje mřížku i modal):
- **Hlavička:** title (skupina/kamera, silný text) · group camera switcher (stávající) · **„Night images" toggle**
  (`role="switch"`, `data-testid="night-toggle"`, default off)
- **Filmstrip** (`data-testid="film-strip"`): flex řádek; každá slza = `button[data-testid="frame-<id>"]`,
  `flex: 1`, vlastní snímek jako background (`cover`, center), dole OSD chip s hodinou (`3 PM`, viewer-local);
  >28 slz → `min-width: 14px` + `overflow-x: auto`
- **Roztažený snímek** (`data-testid="frame-open"`): `flex: 1 1 97%`, obrázek `object-fit: contain` na tmavém
  podkladu, overlay: ‹ › šipky (`aria-label` Previous/Next capture), share tlačítko, OSD chip s plným datem+časem,
  zavření kliknutím mimo/na šipku zpět
- **Night filtr:** skryté snímky se z pásu vyřadí; když je den prázdný jen kvůli filtru → zpráva
  `Every capture today is a night shot.` + tlačítko `Show night images` (data-testid `show-night`), které toggle zapne
- **Prázdný den:** `No images for this date.` (stávající copy) + hint; **loading:** skeleton slzy (`data-testid="film-skeleton"`)
- **Navigace dnem pod pásem** (`data-testid="date-nav"`): ‹ `input[type=date]` ›, meze retence, disabled na okrajích,
  URL sync (`?date=`); při změně dne se hodina z URL maže
- **Share popup** (`data-testid="share-popup"`): titulek `October 18, 2026 · 3 PM`; řada tlačítek sítí
  (Facebook/X/WhatsApp/Telegram — `target="_blank" rel="noopener"`, `aria-label`); „Or copy link" + readonly input
  s URL a tlačítkem `Copy` → `Copied` (2s); overlay + close tlačítko; Esc zavírá
- **Deep linky:** `?date=&hour=` při načtení otevře odpovídající snímek (viewer-local hodina, fallback: nic);
  `?img=<id>` (starší odkazy) se respektuje přednostně ve stejném duchu; `?theme=` beze změny
- **Group mód:** beze změny logiky (switcher, keep-date, latest fallback) — pás patří vybrané kameře
- **Témata:** 4 zachována (CSS proměnné); OSD čipy zůstávají
- **A11y:** focus-visible ringy, klávesové šipky na roztaženém snímku, `aria-pressed` na night toggle

## 9. Demo seeder

- Kamery Alpine: `intervalMinutes: 60`, `latitude/longitude: 51.425/−116.177`; Kite Cam: 60, 53.350/−6.267
- Seeder nově: existující kamery **aktualizuje** (PUT s pouze změněnými poli (partial patch)), pokud se config liší (interval/coords)
- `daylight_only` zůstává false (24h capture dle rozhodnutí)

## 10. Testy a QA

- Core: `sun.test.ts` (referenční hodnoty, polární, DST)
- API: images DTO s `isDaylight` (souřadnice / fallback / polární fallback), admin validace lat/lon + daylight_only
- Worker: `isCaptureDue` daylight větve
- Admin: nová pole + validace (testy rozšířeny)
- Widget: přepsané testy na filmstrip (expand/scrub/share/popup/toggle/deep-linky/fallback/keep-date)
- Vizuální QA: filmstrip den (světlé snímky), noc skrytá, toggle on, roztažený snímek, share popup,
  light + midnight téma, mobilní šířka; screenshoty čte controller
- Deploy: docker rebuild api (migrace 0004) + worker, seeder update, produkční e2e (deep link s hour, toggle)

## 11. Rizika a okrajové případy

- **Viewer-local hodina** v `?hour=` (jako legacy): hodina v URL = hodina na čipu = hodina prohlížeče
  návštěvníka; při jiné tz se může lišit od tz kamery — konzistentní s legacy, dokumentováno
- **Pás při hustých intervalech** (5 min = 288 snímků): min-šířka + scroll; roztažení funguje dál
- **sunTimes null** (polární): fallback okno 20:00–06:00
- **Staré 15min snímky v demo tenantu** zůstávají — pás je zobrazí (smíšená hustota je v pořádku)

## 12. Mimo rozsah

- Sunrise/sunset capture založený na jiném zdroji než souřadnice (např. ruční časy) — jen lat/lon
- White-label, změny ostatních povrchů, změna cen
