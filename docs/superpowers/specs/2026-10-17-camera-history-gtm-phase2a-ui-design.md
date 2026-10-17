# Camera History — GTM Fáze 2A: Admin & Widget UI polish — Design

**Datum:** 2026-10-17
**Stav:** schváleno (brainstorming)
**Navazuje na:** `2026-10-17-camera-history-gtm-demo-deck-design.md` (§3 Fáze 2), `2026-09-18-camera-history-saas-design.md`

## 1. Přehled a cíl

Produkt je funkčně hotový (M1–M6) a reálný capture ověřený (Fáze 1), ale **není prezentovatelný**: widget i admin jsou česky, admin nemá obrazovku pro registraci a vzhled je základní. Fáze 2A dodá **anglické UI, self-service onboarding a jednotný vizuální směr „Alpine clean"**, aby produkt mohl být firmě ukázán bez ostudy.

Tento spec pokrývá **jen podsystém A (UI)**. Demo tenant s reálnými daty (podsystém B) je samostatný spec `…gtm-phase2b-demo-tenant-design.md` a plán.

### Success criteria

- Admin i widget jsou **kompletně anglicky** (viditelné texty, chyby, prázdné stavy).
- Návštěvník se dokáže **sám zaregistrovat** a po registraci je přihlášen v adminu.
- Seznam kamer má **vodící prázdný stav**.
- Widget i admin mají **jednotný, čistý vzhled** (Alpine clean), widget zůstává neutrální a vložitelný.
- Všechny stávající gates (`typecheck`/`test`/`lint`/`build`) zelené; testy aktualizované na angličtinu.

## 2. Rozsah

**V rozsahu:**
- Anglické texty v adminu i widgetu.
- Registrační obrazovka + onboarding (prázdné stavy, vodítka u formuláře kamery).
- Vizuální systém „Alpine clean" (tokeny + restyle stávajících tříd) pro admin a widget.

**Mimo rozsah:**
- i18n přepínač (jen angličtina).
- Nové produktové funkce nad rámec UI.
- Změny billing logiky (jen překlad textů billing stránky).
- Přepracování sady widget témat (`light`/`dark`/`forest`/`midnight` zůstávají).
- Demo tenant / seed data (Fáze 2B).

## 3. Registrace a onboarding

### API
- Do `packages/admin/src/api.ts` přidat:
  `register: (input: { name; slug; email; password }) => POST /api/v1/auth/register`.
- Server po úspěchu nastaví cookies (`ch_access`/`ch_refresh`), takže klient je rovnou přihlášen. Odpověď může obsahovat `billing: { required, checkoutUrl? }`.

### Tok
1. Login obrazovka zobrazí navíc odkaz **„Create account"** (hash routa `#/register`).
2. `Register` obrazovka, pole:
   - **Company name** (povinné)
   - **Slug** — auto-generovaný z názvu, editovatelný; vzor `^[a-z0-9]+(?:-[a-z0-9]+)*$`; náhled „`slug`.camera…" není potřeba.
   - **Email** (povinné)
   - **Password** (min 8 znaků)
3. Odeslání → `register`.
   - Úspěch bez `checkoutUrl` → do adminu na seznam kamer (prázdný stav).
   - Úspěch s `checkoutUrl` → `window.location = checkoutUrl` (Stripe). Při vypnutém Strimu se nestane.
4. Chyby inline:
   - `409` → „That slug is already taken."
   - `400` → text dle `detail` (např. slug vzor, krátké heslo).
5. Z registrace zpět odkaz **„Already have an account? Sign in."**

### Prázdný stav seznamu kamer
- Nadpis: **„No cameras yet"**
- Text: „Add your first camera to start building its history."
- Tlačítko: **„Add your first camera"** (otevře formulář kamery).

## 4. Angličtina — mapování textů

| Místo | Současně (CS) | Nově (EN) |
|---|---|---|
| `api.ts` FEED_LABELS | Statický obrázek (HTTP) / MJPEG stream / HLS (ffmpeg) / RTSP (ffmpeg) / Custom WebSocket | Static image (HTTP) / MJPEG stream / HLS (ffmpeg) / RTSP (ffmpeg) / Custom WebSocket |
| `api.ts` THEME_LABELS | Světlé / Tmavé / Lesní / Půlnoc | Light / Dark / Forest / Midnight |
| `App.tsx` STATUS_LABELS | V běhu / Zpožděno / Výpadek | Operational / Delayed / Offline |
| Login | Přihlásit se | Sign in |
| Camera form | Upravit kameru / Nová kamera / Název / Typ / Feed URL / Téma / Interval (min) / Aktivní od / Aktivní do / Časové pásmo / Uložit / Zrušit | Edit camera / New camera / Name / Type / Feed URL / Theme / Interval (min) / Active from / Active to / Timezone / Save / Cancel |
| Table | Název / Typ / Povolena / Stav / Poslední snímek / Chyba / Náhled / Žádné kamery. / ano / ne | Name / Type / Enabled / Status / Last capture / Error / Preview / No cameras. / yes / no |
| Actions | Nová kamera / Upravit / Smazat / Odhlásit / Kamery / Billing | New camera / Edit / Delete / Sign out / Cameras / Billing |
| Confirm | Smazat kameru … ? Smažou se i všechny snímky. | Delete camera …? This also deletes all of its images. |
| Loading | Načítám… | Loading… |
| Widget empty | Žádné snímky pro toto datum. | No images for this date. |
| Billing | není aktivováno / aktivní / po splatnosti / není zaplaceno / zrušeno / Platba proběhla úspěšně. / Platba byla zrušena. / Změna tarifu se projeví na příští faktuře. / Načítám… / Platební integrace není aktuálně zapnutá. / Účet není aktivní. Obnovte platbu pro zapnutí kamer. / Aktuální tarif / kamera / měsíc / aktuální / Změnit tarif / Uloženo / Odhad plné retence | not activated / active / past due / unpaid / canceled / Payment completed. / Payment was canceled. / The plan change will apply on your next invoice. / Loading… / Billing is not enabled right now. / Account is not active. Restore payment to enable cameras. / Current plan / camera / month / current / Change plan / Stored / Estimated full retention |

Vodítka u formuláře kamery (nová, anglicky, stručně):
- Type: krátký popis, např. „Static image fetches a JPEG URL. MJPEG is a motion-JPEG stream. HLS/RTSP use ffmpeg. Custom is a WebSocket that sends JPEG frames."
- Timezone: hint „IANA timezone, e.g. `Europe/Zurich`."

> Pozn.: widget hlavička už používá „Camera"/anglická aria jména; sjednotit jen prázdný stav.

## 5. Vizuální systém „Alpine clean"

Tokeny (CSS custom properties, duplikované v `packages/admin/src/App.css` i `packages/web/src/App.css`, protože balíčky jsou nezávislé):

```
--bg: #f6f8fb;        /* chladné, vzdušné pozadí */
--surface: #ffffff;
--text: #0f172a;
--muted: #64748b;
--border: #e2e8f0;
--accent: #2563eb;    /* alpine blue */
--accent-weak: #eff6ff;
--danger: #dc2626;
--radius: 10px;
--shadow: 0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08);
```

- **Typografie:** systémový stack (`system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`). Žádný webfont (YAGNI, výkon).
- **Spacing:** 4px scale. 
- **Admin:** čistý topbar (surface, spodní border), obsah v card panelu (`--surface`, `--radius`, `--shadow`), přehledná tabulka (jemné borders, hover), výrazné primární tlačítko (`--accent`), sekundární neutrální, danger `--danger`.
- **Widget:** téma `light` srovnat na stejnou paletu; zachovat `dark`/`forest`/`midnight`. Neutrální, lehké, bez výrazného brandingu.
- **Zachovat** všechny `data-testid` a strukturu DOM (jen třídy/CSS), aby testy a e2e zůstaly funkční.

## 6. Změněné soubory

- `packages/admin/src/api.ts` — FEED_LABELS/THEME_LABELS → EN; přidat `register`.
- `packages/admin/src/App.tsx` — EN texty, `Register` obrazovka, routa `#/register`, prázdný stav, vodítka.
- `packages/admin/src/Billing.tsx` — EN texty.
- `packages/admin/src/App.css` — tokeny + Alpine clean restyle.
- `packages/admin/src/test/App.test.tsx` — EN aserce (statusy), test registrace, test prázdného stavu.
- `packages/admin/src/test/Billing.test.tsx` — EN aserce (`po splatnosti` → `past due`).
- `packages/web/src/App.tsx` — EN prázdný stav.
- `packages/web/src/App.css` — srovnání tokenů/palety, zachovat témata.
- `packages/web/src/test/App.test.tsx` — případná úprava prázdného stavu.

## 7. Verifikace

- **Gates:** `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` zelené.
- **Unit testy (vitest):** registrační tok (úspěch → admin; 409 → inline chyba), prázdný stav kamer, anglické status labely, billing EN text.
- **Manuální QA checklist:** registrace na čisto → prázdný stav → přidání kamery → widget zobrazí snímky; přepnutí témat widgetu; mobilní šířka; vizuální kontrola adminu.
- **e2e (volitelně):** jeden admin e2e scénář registrace, pokud zůstane levný.

## 8. Rizika

- **Testy vázané na české texty** — řešeno souběžnou aktualizací testů v plánu.
- **Duplikace tokenů** v admin/web (nezávislé balíčky) — záměrné; případný sdílený CSS balíček je mimo rozsah.
- **Překlad billing textů** — Stripe je defaultně vypnutý; texty jen pro konzistenci, netestováno proti reálnému Stripe.
