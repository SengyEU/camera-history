# Hourly alignment + WebP pipeline + night default — Design

**Datum:** 2026-10-18
**Stav:** schváleno (brainstorming: 3 rozhodnutí uživatele), připraveno k implementačnímu plánu
**Navazuje na:** `2026-10-18-camera-history-widget-filmstrip-design.md` (filmstrip + night toggle)

## 1. Cíl

Sjednotit demo (a celý produkt) na **čistě hodinovou kadenci** a zrychlit načítání:
1. **Smazat všechna nekvalitní (ne-celohodinová) data** — hard delete všech snímků s minutou ≠ :00,
   ve **všech tenantech**, z DB i MinIO.
2. **Nové capture zarovnat na celou hodinu** (interval-aligned buckety), aby pás měl 1 snímek/hodinu
   (den i noc) jako legacy.
3. **Komprese při capture** — WebP, max šířka 1600 px, kvalita 75 (dnes ~600 KB JPEG → ~80–200 KB).
4. **Překonvertovat všechny stávající** (po purge) na WebP + nahradit originály.
5. **Admin per-kamera přepínač**: defaultně se v widgetu ukazují jen denní snímky; v adminu lze per
   kamera zapnout, že se zobrazují i noční (výchozí stav night toggle ve widgetu).

## 2. Klíčová rozhodnutí (uživatel)

| Oblast | Rozhodnutí |
|---|---|
| Night default | Widget default = jen den; per-kamera checkbox v adminu „Show night images by default“; viewer toggle zůstává |
| Formát | **WebP, max 1600 px šířka, q75** (ffmpeg libwebp) |
| Mazání | **Všechny tenanty/kamery**: minuta ≠ :00 → hard delete (DB řádek + MinIO objekt) |
| Alignment | Capture v interval-aligned buckety (60 min → na celou hodinu UTC; 5/15/30 taky aligned) |

## 3. Data

Migrace `0005`:
```sql
ALTER TABLE cameras ADD COLUMN show_night boolean NOT NULL DEFAULT false;
```
Core typy: `Camera` + `showNight: boolean`; `PublicCamera` + `showNight: boolean`;
`PublicGroupCamera` (group resolve) + `showNight: boolean` (widget v group módu potřebuje
default pro vybranou kameru). Repos real+fake: mapování sloupce; admin create/update vstup.

## 4. Worker

### 4.1 Komprese (všechny feed typy)
- Nová utilita `packages/worker/src/imageConvert.ts`: `toWebp(input: Buffer): Promise<Buffer>` —
  ffmpeg (`libwebp`, `-vf scale='min(1600,iw)':-2`, `-quality 75`, `-f webp`, pipe in/out).
  (Worker image má ffmpeg; ověřit `ffmpeg -encoders | grep webp` v kontejneru.)
- `captureRun` po získání bufferu (static/mjpeg/hls/rtsp/custom) vždy prožene `toWebp` před uložením;
  storageKey `…/{YYYY-MM-DD}/{HHMMSS}.webp`.
- Chyba konverze = capture error (retry dle stávající logiky).

### 4.2 Interval-aligned bucket due
- `isCaptureDue` nový model: `bucketStart = floor(now / intervalMs) * intervalMs` (UTC);
  due když `enabled && inWindow && (lastCaptureAt == null || lastCaptureAt < bucketStart)`.
- Tím capture padne na první tick po hranici bucketu (tickMs ≤ 60 s ⇒ čas v minutě :00).
- Platí pro všechny intervaly (5/15/30/60 → aligned v UTC; celohodinové tz → lokálně v celou hodinu).
- Daylight-only okno zachováno (mimo okno se necapturuje; bucket logika se aplikuje uvnitř okna).

## 5. API

- File route: `fileRe` rozšířit na `^\d{6}\.(webp|jpg)$` (legacy .jpg zůstává servírovatelný během
  přechodu); content-type dle přípony (`image/webp` / `image/jpeg`).
- Images DTO `url` se odvozuje ze storageKey (beze změny kódu — po konverzi končí .webp).
- Admin API: `showNight` (strict boolean, jako `daylightOnly`); POST/PUT accepted fields.

## 6. Admin UI

- `CameraForm` sekce „Location & schedule“ + nový checkbox `form-show-night`
  „Show night images by default“, hint „Viewers can still toggle night images in the widget.“
- `CameraInput`/`toInput`/payload + testy (additive).

## 7. Widget

- Night toggle **výchozí stav** = `camera.showNight` (single route z `getCamera`; group route
  z `PublicGroupCamera.showNight` vybrané kamery). Při přepnutí kamery ve skupině se default
  resynchronizuje (viewer toggle v rámci jedné kamery přebíjí).
- Chování filtru/`show-night` cesty beze změny.

## 8. Ops skripty (host, idempotentní)

- `scripts/purge-offhour.mjs`: přes pg (DATABASE_URL z `.env`) vybere `images WHERE EXTRACT(MINUTE FROM timestamp) <> 0`,
  smaže MinIO objekty (MINIO_* z `.env`) i DB řádky; loguje počty; `--dry-run` flag; po dokončení
  vypíše summary. (Spouští controller po deployi workeru s alignmentem, aby mezitím nevznikla nová off-hour data.)
- `scripts/convert-webp.mjs`: pro každý snímek s `storage_key LIKE '%.jpg'`: stáhne objekt, přes host
  ffmpeg (`libwebp`, 1600px, q75) převede, uloží `.webp` se stejnou cestou (jiná přípona), updatne
  `storage_key`, smaže originál; idempotentní (skip .webp), `--dry-run`, průběžný log + summary
  (celkem převedeno / bytes before → after).

## 9. Pořadí nasazení a verifikace

1. Deploy: `docker compose up -d --build api worker` (migrace 0005; worker s WebP + alignmentem);
   build web/admin dist.
2. **Purge** (controller): `node scripts/purge-offhour.mjs` → counts;
   kontrola: `SELECT count(*) FILTER (WHERE EXTRACT(MINUTE FROM timestamp)<>0) = 0`.
3. **Convert**: `node scripts/convert-webp.mjs` → summary (počet, úspora); kontrola žádné .jpg.
4. Widget QA: pás pro aktuální den = 1 snímek/hodina; night toggle → hodinové noční snímky (IR);
   načtení pásu výrazně rychlejší (součty kB); admin checkbox mění default toggle po reloadu.
5. Testy: worker (convertSpy/ffmpeg, bucket due), API (webp route + showNight), admin (checkbox),
   widget (default z camera.showNight; resync při switchi). Gates zelené.
6. Demo (volitelně dle uživatele): na demo kamerách checkbox zapnout? **Ne** — default day-only dle
   rozhodnutí; toggle zůstává pro návštěvníka.

## 10. Rizika

- ffmpeg v worker image bez libwebp → ověřit krokem v plánu (`docker compose exec worker ffmpeg -encoders`).
- Purge je destruktivní → dry-run + counts; skript běží až po nasazení workeru s alignmentem.
- Backfill: stovky–tisíce snímků, ffmpeg per soubor — běh v minutách, idempotentní, opakovatelný.
- Starší `.jpg` URL v už sdílených odkazech: file route .jpg podporuje dál (forever), soubory po konverzi
  neexistují → 404 (akceptováno; veřejné share URL jsou date+hour, ne přímé soubory).

## 11. Mimo rozsah

- AVIF, měnění historických timestampů (nekvalitní data se mažou, neposouvají), white-label.
