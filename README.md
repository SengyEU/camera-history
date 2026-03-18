# 📷 Camera History - Kite Sport Centre

Tento projekt je webová aplikace (Frontend + Backend), která slouží k automatickému ukládání a následnému zobrazování historických snímků z živé kamery z [Kite Sport Centre](https://www.kitesportcentre.com/garrylucas-beach-live-cam/).

🌐 **Live ukázka / Web:** [www.kitesportcentre.com/garrylucas-beach-live-cam/](https://www.kitesportcentre.com/garrylucas-beach-live-cam/)

## 📝 O projektu

Mnoho živých kamer na internetu poskytuje pouze aktuální stream, ale neumožňuje podívat se zpětně, jaké byly podmínky (např. pro kitesurfing). Cílem tohoto projektu bylo vytvořit řešení, které bude periodicky ukládat snímky z kamery a nabídne uživatelsky přívětivé rozhraní pro jejich prohlížení.

## 🛠️ Architektura a technologie

Projekt se skládá ze dvou hlavních částí:

### 1. Backend (PHP)

Stará se o získávání dat, ukládání obrázků a komunikaci s frontendem.

- `worker.php` - Skript, který se spouští na pozadí a stahuje aktuální snímek z kamery.
- `db.php` - Zajišťuje logiku pro evidenci stažených snímků.
- `api.php` / `getimage.php` - API endpointy, na které se dotazuje frontend pro získání seznamu snímků nebo konkrétní fotografie.

### 2. Frontend (React)

Klientská část, která vizualizuje uložená data.

- Využívá JavaScript pro asynchronní dotazování na `api.php`.
- Zobrazuje časovou osu / historii snímků, mezi kterými může uživatel listovat.
