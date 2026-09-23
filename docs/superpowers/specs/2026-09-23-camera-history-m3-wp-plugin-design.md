# Camera History — M3: WordPress plugin (design spec)

Datum: 2026-09-23
Stav: schváleno (design review), čeká na implementation plan
Navazuje na: `2026-09-18-camera-history-saas-design.md` §11, design spec §7/§9/§10 (theme, API, embed kód).

## 1. Cíl

Tenký WordPress plugin, který do stránky editoru/klienta vloží iframe widgetu Camera History SaaS
(`https://{domena}/widget/{tenant_slug}/{camera_id}?theme=...`). Správce WP vyplní přihlašovací údaje
(email+heslo do SaaS admina) a vybere kameru z dropdownu naplněného z admin API. Bez Composer
závislostí, bez cache seznamu kamer, minimální scope.

## 2. Volby učiněné během brainstormingu

- **Přístup A — Admin JWT**: dropádovný seznam kamer čte plugin z `GET /api/v1/admin/cameras`
  (JWT přes cookie z `POST /api/v1/auth/login`). **Žádná změna backendu/API** (ani nový endpoint, ani tenant klíč).
- **Bez cache seznamu kamer** — seznam se načítá čistě při otevření správcovské stránky pluginu.
- **Shortcodes**: `[camera-history camera="…" width="…" height="…" theme="…"]` — tenant slug NENÍ parametr
  shortcodu, pochází z globálního nastavení pluginu (`tenant_slug`).
- **Testování**: `php -l` syntax check + strukturální kontrola ZIP + repo gaty (eslint/typecheck na TS zip skriptu).

## 3. Struktura a umístění

Adresář `packages/wp-plugin/` je **mimo** npm workspace globu `packages/*` (WP plugin není JS balík —
root `package.json` má `workspaces: ["packages/*"]`, proto zip skript je v `scripts/`, nikoli v `packages/wp-plugin/package.json`).

```
packages/wp-plugin/
  camera-history/
    camera-history.php        // plugin hlavička, ABSPATH guard, inkluze tříd, init hooky
    includes/
      class-settings.php      // správcovská stránka + sanitizace + register_setting
      class-client.php        // HTTP klient (login, listCameras, refresh, re-login)
      class-shortcode.php     // [camera-history …] → iframe
    uninstall.php             // mazání options
    readme.txt                // standardní WP readme
scripts/
  zip-wp-plugin.mjs           // zabalí packages/wp-plugin/camera-history/ → packages/wp-plugin/dist/camera-history.zip
```

Plugin root složka se jmenuje `camera-history/` — ZIP rozbalí WP do vlastní složky.

## 4. Komponenty a data flow

### 4.1 `camera-history.php`

- Hlavička plugin file (`Plugin Name: Camera History`, `Version`, `Text Domain`).
- `defined( 'ABSPATH' ) || exit;` guard.
- Inklude tříd (require_once), init na `plugins_loaded` hook: registrace shortcodu + settings.
- Aktivace: žádná DB práce (jen options přes register_setting), deaktivace čistá.

### 4.2 `class-settings.php` — `Ch_Settings`

Nastavení (WP options, prefix `ch_`):
| klíč | label | sanitizace |
|---|---|---|
| `ch_api_base_url` | API URL | `esc_url_raw`, odstranění trailing slash, must start `https://` |
| `ch_email` | E-mail | `sanitize_email` |
| `ch_password` | Heslo | nikdy nezobrazovat; prázdná hodnota = ponechat uložené |
| `ch_tenant_slug` | Tenant slug | `sanitize_title` |

- Hooky: `admin_menu` (submenu „Camera History" do Settings), `admin_init` (register_setting + nonce).
- Page render: `current_user_can('manage_options')` guard; iframe a kapátko: seznam kamer přes `Ch_Client::list_cameras()`,
  chyba → `admin_notices` s popisem z RFC 7807 `detail` (escapované).
- Heslo: HTML nápověda „heslo se nezobrazuje, prázdné znamená zachovat", nikdy plnění hodnoty do inputu.
- Value vrácení pro dropdown: `<select>` z kamer `{id, name, feedType, status}`.

### 4.3 `class-client.php` — `Ch_Client`

- `login()`: `wp_remote_post( base . '/api/v1/auth/login', { headers: {'Content-Type':'application/json'}, body: json_encode(email,password), timeout: 15 } )`.
  Z `Set-Cookie` responze extrahuje `ch_access` a `ch_refresh`, uloží do transientu `ch_tokens` (TTL 2 min).
- `list_cameras()`: `wp_remote_get( base . '/api/v1/admin/cameras' )` s cookies z transientu.
  - HTTP 401 → `refresh()`: `POST /api/v1/auth/refresh` s `ch_refresh`; pokud i refresh 401 → re-`login()`.
  - Vrací pole z `{cameras: [...]}` (jen `id`, `name`, `feedType`, `status`), kód 1 na network/HTTP chybě
    s `detail` z RFC 7807 těla (fallback na `"request failed: {code}"`).
- Konfigurovatelný endpoint timeout 15 s, `$http_args` bez SSL verify override (WP default).

### 4.4 `class-shortcode.php` — `Ch_Shortcode`

- `add_shortcode('camera-history', [$this,'render'])` na `plugins_loaded`/init.
- Atributy: `camera` (povinné), `width` (default `100%`), `height` (default `600`), `theme` (volitelné).
- Výstup: `<iframe src="{esc_url( base . '/widget/' . tenant_slug . '/' . camera_id . (theme ? '?theme=' . esc_attr(theme) : '') )}" width="…" height="…" style="border:0" allowfullscreen loading="lazy"></iframe>`,
  `width`/`height` přes `esc_attr`.
- Chybějící `tenant_slug`/`camera` → escapovaný `<p class="ch-error">` text; frontend nikdy nezbortí.

### 4.5 `uninstall.php`

- `if ( ! defined('WP_UNINSTALL_PLUGIN') ) exit;`
- `delete_option` na všech 4 klíčích + `delete_transient('ch_tokens')`.

### 4.6 `scripts/zip-wp-plugin.mjs`

- Node script bez deps: zip `packages/wp-plugin/camera-history/**` do `packages/wp-plugin/dist/camera-history.zip`
  (root ZIP obsahuje `camera-history/`, `dist/` je v .gitignore). Součást release flow; v příručce README.

## 5. API kontrakt (využívané existující endpointy)

- `POST /api/v1/auth/login` `{email,password}` → 200 `{status:"ok"}` + Set-Cookie `ch_access` (15 min), `ch_refresh` (7 dní).
- `POST /api/v1/auth/refresh` cookie `ch_refresh` → 200, nový `ch_access` cookie.
- `GET /api/v1/admin/cameras` (cookie `ch_access`) → `{cameras:[{id,name,feedType,status,…}]}`.
- Chyby: RFC 7807 body `{type,title,status,detail}` v `application/problem+json`.

Žádný z endpointů se nemění.

## 6. Chyby a bezpečnost

- Admin notices s detail z RFC 7807; escapování veškerého výstupu (`esc_url`, `esc_attr`, `esc_html`, `sanitize_*`).
- Settings přístup jen pro `manage_options`, `register_setting` + nonce.
- Žádné secrets (heslo) v logu ani výstupu; heslo v options je nutné (WP standard), nepsat do logů.
- Shortcode frontend: chyba konfigurace = escapovaný fallback text, ne vyjímka/smrt.

## 7. Testování

- `php -l` na všech `.php` souborech (`php` musí existovat na VPS — ověřit; jinak dokumentovat).
- Strukturální kontrola: ZIP obsahuje `camera-history/camera-history.php`, readme.txt, includes/.
- Repo gaty: eslint + typecheck (TS zip skript), nezapomenout, že `packages/wp-plugin` NESMÍ spadat do npm workspace testování.
- Manuální smoke (mimo repo): instalace ZIP do WP admina, nastavení email/heslo/slug, vložení shortcodu — popis v README sekce M3.
- PHPUnit/WP test suite NE — mimo rozsah (design choice §2).

## 8. Mimo rozsah (explicitně)

- WordPress.org plugin repo / update endpoint.
- Cache seznamu kamer (dle brainstormentu „bez cache").
- i18n.
- Nový backend endpoint / tenant API key.
- Widget themes (M5) — plugin jen propaguje `?theme=` pass-through.

## 9. Validace hotovosti (definition of done)

- ZIP skript běží a vyrobí `packages/wp-plugin/dist/camera-history.zip` se správnou strukturou.
- `php -l` 0 chyb na všech souborech.
- Repo gate (lint/typecheck/build/test) PASS beze změny workspace nasazení (wp-plugin mimo workspaces).
- README obsahuje sekci M3 (install, konfigurace, shortcode, zip build).
- Ruční installflow popsán; případná manuální WP instalace na reálném hostingu je na uživateli.