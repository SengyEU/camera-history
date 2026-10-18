# Hourly alignment + WebP pipeline + night default — Design

**Datum:** 2026-10-18
**Stav:** schváleno (brainstorming: 3 rozhodnutí uživatele), připraveno k implementačnímu plánu
**Navazuje na:** `2026-10-18-camera-history-widget-filmstrip-design.md` (filmstrip + night toggle)

## 1. Cíl

Sjednotit demo (a celý produkt) na **čistě hodinovou kadenci** a zrychlit načítání:
1. **Zredukovat data na 1 snímek/kameru/hodinu** — ponechat snímek nejblíž :00, ostatní hard delete
   ve **všech tenantech**, z DB i MinIO.
2. **Nové capture zarovnat na celou hodinu** (interval-aligned buckety), aby pás měl 1 snímek/hodinu
   (den i noc) jako legacy.
3. **Komprese při capture** — WebP, max šířka 1600 px, kvalita 75 (dnes ~600 KB JPEG → ~80–200 KB).
4. **Překonvertovat všechny stávající** (po purge) na WebP + nahradit originály.
5. **Admin per-kamera přepínač**: defaultně se v widgetu ukazují jen denní snímky; v adminu lze per
   kamera zapnout, že se zobrazují i noční (viditelnost je řízena pouze adminem, viewer toggle neexistuje).

## 2. Klíčová rozhodnutí (uživatel)

| Oblast | Rozhodnutí |
|---|---|
| Night default | Widget default = jen den; per-kamera checkbox v adminu „Show night images by default“; viditelnost nočních snímků řídí pouze admin (žádný viewer toggle) |
| Formát | **WebP, max 1600 px šířka, q75** (ffmpeg libwebp) |
| Mazání | **Všechny tenanty/kamery**: z každé kamery-hodiny ponechat 1 snímek nejblíž :00, ostatní hard delete (DB řádek + MinIO objekt) — upřesněno uživatelem před během |
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
  „Show night images by default“, hint „Night images are shown in the widget only when this is enabled.“
- `CameraInput`/`toInput`/payload + testy (additive).

## 7. Widget

- Viewer toggle neexistuje: noční snímky se ve widgetu zobrazují pouze když má kamera
  `showNight = true` (single route z `getCamera`; group route z `PublicGroupCamera.showNight`
  vybrané kamery). Při přepnutí kamery ve skupině se viditelnost resynchronizuje; mění ji
  výhradně admin.
- Chování filtru/`show-night` cesty beze změny.

## 8. Ops skripty (host, idempotentní)

- `scripts/purge-offhour.mjs`: přes pg (DATABASE_URL z `.env`) ponechá **1 snímek na kameru a UTC hodinu**
  (nejblíž :00 — řazení dle `EXTRACT(MINUTE)*60 + EXTRACT(SECOND)` v UTC) a ostatní smaže:
  MinIO objekty (MINIO_* z `.env`) i DB řádky; loguje počty (extra snímky, smazané objekty,
  kamerohodiny s >1 snímkem); `--dry-run` flag; po dokončení vypíše summary.
  (Spouští controller po deployi workeru s alignmentem, aby mezitím nevznikla nová off-hour data.)
- `scripts/convert-webp.mjs`: pro každý snímek s `storage_key LIKE '%.jpg'`: stáhne objekt, přes host
  ffmpeg (`libwebp`, 1600px, q75) převede, uloží `.webp` se stejnou cestou (jiná přípona), updatne
  `storage_key`, smaže originál; idempotentní (skip .webp), `--dry-run`, průběžný log + summary
  (celkem převedeno / bytes before → after).

## 9. Pořadí nasazení a verifikace

1. Deploy: `docker compose up -d --build api worker` (migrace 0005; worker s WebP + alignmentem);
   build web/admin dist.
2. **Purge** (controller): `node scripts/purge-offhour.mjs` → counts (extra snímky / smazané objekty);
   kontrola: žádná kamerohodina (UTC) nemá víc než 1 snímek a ponechaný snímek je nejblíž :00:
   `SELECT count(*) FROM (SELECT camera_id, date_trunc('hour', timestamp AT TIME ZONE 'UTC') FROM images GROUP BY 1,2 HAVING count(*) > 1) dupes` = 0.
3. **Convert**: `node scripts/convert-webp.mjs` → summary (počet, úspora); kontrola žádné .jpg.
4. Widget QA: pás pro aktuální den = 1 snímek/hodina; se zapnutým admin checkboxem se zobrazují
   hodinové noční snímky (IR); načtení pásu výrazně rychlejší (součty kB); admin checkbox řídí
   viditelnost nočních snímků (projeví se po reloadu).
5. Testy: worker (convertSpy/ffmpeg, bucket due), API (webp route + showNight), admin (checkbox),
   widget (default z camera.showNight; resync při switchi). Gates zelené.
6. Demo (volitelně dle uživatele): na demo kamerách checkbox zapnout? **Ne** — default day-only dle
   rozhodnutí; noční snímky se ukážou jen, když je admin zapne.

## 10. Rizika

- ffmpeg v worker image bez libwebp → ověřit krokem v plánu (`docker compose exec worker ffmpeg -encoders`).
- Purge je destruktivní → dry-run + counts; skript běží až po nasazení workeru s alignmentem.
- Backfill: stovky–tisíce snímků, ffmpeg per soubor — běh v minutách, idempotentní, opakovatelný.
- Starší `.jpg` URL v už sdílených odkazech: file route .jpg podporuje dál (forever), soubory po konverzi
  neexistují → 404 (akceptováno; veřejné share URL jsou date+hour, ne přímé soubory).

## 11. Mimo rozsah

- AVIF, měnění historických timestampů (nekvalitní data se mažou, neposouvají), white-label.
