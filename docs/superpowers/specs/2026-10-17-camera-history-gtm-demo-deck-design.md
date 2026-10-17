# Camera History — Go-to-Market balíček (demo + deck) — Design

**Datum:** 2026-10-17
**Stav:** schváleno (brainstorming), připraveno k implementačnímu plánu
**Navazuje na:** `2026-09-18-camera-history-saas-design.md` (produkt M1–M6 hotový)

## 1. Přehled a cíl

Produkt (multi-tenant SaaS: periodické snímkování kamer + embedovatelný widget s historií) je funkčně hotový (M1–M6), ale **není prodejný**: vše česky, vzhled základní, chybí registrační UI, demo data i jakékoli marketingové materiály.

Cílem je přeměnit ho na **prodejný balíček**, kterým lze oslovit střediska (skiareály, resorty, turistická místa) po celém světě:

1. **Živé demo** s reálnými daty veřejných kamer, dostupné odkazem.
2. **Webový deck + landing** pro oslovení firem.

### Success criteria

- Odkaz na živé demo otevře cizí člověk kdekoliv na světě a uvidí **věrohodné, bohaté demo** střediska (widget s procházetelnou historií více dní).
- Demo i produkt jsou **anglicky** a působí jako hotový produkt (widget vložitelný do cizího webu, admin jako self-service SaaS).
- Deck a landing jdou poslat firmě (odkaz + PDF export) a vedou ke konverzaci/CTA.
- Vše běží na `camera.sengycraft.cz`.

## 2. Klíčová rozhodnutí

| Oblast | Rozhodnutí |
|---|---|
| Jazyk | **Angličtina** napříč produktem i materiály (bez i18n přepínače — ten mimo rozsah) |
| Hosting | Stávající VPS/doména **`camera.sengycraft.cz`**; landing na `/`, deck na `/deck/` |
| Deck | **Webový deck v Reveal.js** hostovaný online + export do PDF (print-to-PDF) |
| Zdroj kamer | **Reálné veřejné webkamery** (mountain/ski) + známý KiteSport WS feed |
| Historie | **Hybrid**: primárně kamery s archivem (okamžitá bohatá historie) + worker průběžně snímá reálně |
| Vizuální směr | **A „Alpine clean"** pro widget/admin; deck jemný hybrid A+B (světlá základna, velké horské snímky, tmavé hero pasáže) |
| Rozsah | Cesta **B — „Demo napřed, pak prodej"**, 4 fáze |

## 3. Fáze a deliverables

### Fáze 1 — Recon & opravy

**Cíl:** reálně spustit produkt na veřejných kamerách, projít celý tok a odstranit funkční chyby.

- Spustit stack (docker compose) na reálných veřejných feedech.
- Projít a zdokumentovat celý tok: registrace → přidání kamery → capture → widget → admin → billing.
- Sepsat **prioritizovaný seznam chyb a nedodělků** (funkční vs kosmetické).
- Opravit **funkční chyby**; kosmetiku řešit až ve Fázi 2.

**Výstup:** fungující produkt + seznam nálezů + opravy funkčních chyb.

**Poznámka:** recon proběhne před psaním detailního implementačního plánu Fáze 2, protože seznam nálezů přímo určí obsah Fáze 2 (viz Rizika).

### Fáze 2 — Produktové doladění + demo tenant

- **Angličtina** napříč widgetem i adminem (viditelné texty, chyby, prázdné stavy).
- **Chybějící UI pro registraci/onboarding** (API registraci má, chybí obrazovka) + rozumné prázdné stavy.
- **Vizuální sjednocení** widgetu i adminu ve směru „Alpine clean".
- **Demo tenant** (viz §4) na reálných veřejných kamerách + naplněná historie.
- Skript pro založení/naplnění demo tenanta (idempotentní, opakovatelný).

**Výstup:** produkt, který lze firmě ukázat bez ostudy + bohaté demo.

### Fáze 3 — Prodejní materiály

- **Webový deck** v **Reveal.js** (~12 slidů, anglicky) dle struktury v §6, s vloženým živým demem; export do PDF přes print-to-PDF.
- **Landing stránka** (anglicky) dle §7 s CTA, na `/`.

**Výstup:** deck (odkaz + PDF) a landing, připravené k oslovení firem.

### Fáze 4 — Nasazení

- Demo tenant + produkt + landing/deck na `camera.sengycraft.cz` (produkt dle M6 runbooku).
- Statické naservírování landingu/decku (nginx).
- Deploy smoke.

**Výstup:** vše veřejně dostupné na produkční adrese.

## 4. Demo tenant a historie

### Struktura

- **Jeden vlajkový fiktivní resort** (např. *Alpine Resort – Zermatt*) se **2–4 reálnými kamerami** (různé úhly/lokality), aby to působilo jako skutečné středisko.
- Volitelně druhý tenant pro ukázku multi-tenancy.
- Kamery nastaveny s intervalem 5–15 min (bohatý den), retence dle demo potřeby.

### Zdroje kamer

- **KiteSport WS feed** (`wss://cam.kitesportcentre.com/gl-cam`) — prokazatelně funkční přes `custom` adaptér.
- **Veřejné horské/ski kamery** vystavující statické JPEG (`static_url`) nebo HLS/MJPEG. Preferovat kamery s archivem (často Roundshot).

### Strategie historie (Hybrid)

1. Pro kamery s archivem: nahrát zpětně **desítky snímků na více dní** → okamžitá bohatá historie.
2. Worker běží dál a historii **průběžně doplňuje reálnými snímky** → demo nikdy nezmrzne.
3. Pro kamery bez archivu: rozjede se reálný capture (fallback).

**Nepoužíváme** syntetický backfill (vyrobená historie z jednoho snímku) — prozradilo by se.

### Otevřený bod

Konkrétní seznam kamer a dostupnost archivů se určí v reconu (Fáze 1 / začátek Fáze 2). Spec neurčuje konkrétní URL — ty se ověří za běhu.

## 5. Vizuální směr

Tři povrchy, každý jiný účel:

1. **Widget** — vkládá se do cizích webů, musí splynout. Neutrální branding; stávající témata `light`/`dark`/`forest`/`midnight` zůstávají. Moderní a čistý, ale nevtíravý.
2. **Admin** — interní SaaS dashboard. Čistý, utilitární, přehledný, anglicky, s onboardingem a prázdnými stavy.
3. **Deck + landing** — marketing. Výrazný, pracuje s krásnými horskými snímky jako hrdinou.

**Směr A „Alpine clean":** světlé, vzdušné, chladné neutrály + jeden svěží akcent. Widget neutrální a lehký; admin čistý produktový; deck vzdušný a sebevědomý.

**Deck:** jemný hybrid A+B — světlá základna, ale velké horské snímky a tmavé `hero` pasáže pro dramatičnost.

## 6. Deck — struktura (~12 slidů)

1. **Hero** — velký horský snímek, tagline (např. *„Your webcam only shows now. We add the history."*).
2. **Problém** — kamery ukazují jen „teď"; návštěvník nevidí, jak to vypadalo dřív; web ztrácí engagement.
3. **Řešení** — embedovatelný widget s prohlížitelnou historií; vložení jedním `<iframe>`.
4. **Živé demo** — vložený interaktivní widget nebo odkaz/QR na demo.
5. **Jak to funguje** — capture → úložiště → widget (jednoduchý diagram).
6. **Funkce** — feed typy, témata, retence, sdílení, mobil.
7. **Admin dashboard** — screenshot, self-service správa.
8. **Integrace** — WordPress plugin, jakýkoli web (iframe).
9. **Ceník** — retenční tiery (viz původní spec §13).
10. **Pro koho** — skiareály, pláže, turistická místa, stavby, počasí.
11. **Proč my** — odlišení.
12. **CTA** — vyzkoušet demo / domluvit hovor.

## 7. Landing

Jednostránkový anglický web: hero s CTA, funkce, ceník, odkaz na živé demo, kontakt. Cílí na konverzi (rezervace hovoru / odkaz na demo).

## 8. Verifikace

- Stávající gates (`typecheck`/`test`/`lint`/`build`) musí zůstat zelené.
- Doplňkové e2e pro reálné toky widget/admin.
- Manuální QA checklist pro demo: snímky se načítají, dny se dají procházet, témata fungují, sdílení funguje, mobil.
- Deck/landing: kontrola v prohlížeči, export PDF, mobil, funkční odkazy.
- Deploy smoke dle M6 runbooku na `camera.sengycraft.cz`.

## 9. Provoz

- Znovu použít M6 docker compose + runbook (`2026-09-24-camera-history-m6-deploy-*`).
- Navíc: skript pro založení/naplnění demo tenanta; statické naservírování landingu/decku (nginx).

## 10. Mimo rozsah

- White-label branding.
- Multi-language UI (jen angličtina).
- Nové produktové funkce nad rámec dema a nutných oprav.
- Placená reklama.

## 11. Rizika a otevřené body

- **Dostupnost archivů veřejných kamer** — nemusí být k dispozici; fallback je reálný capture (historie tenčí). Řeší recon ve Fázi 1.
- **Rozsah Fáze 2 závisí na reconu** — detailní implementační plán Fáze 2 se sepíše po Fázi 1.
- **Právní/ToS** použití veřejných webkamer pro demo — preferovat kamery, jejichž použití je pro ukázku bezpečné.
- **Kvalita snímků** veřejných kamer (rozlišení, vodoznaky) — vybírat reprezentativní zdroje.
