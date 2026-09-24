# M3 — WordPress plugin: thin PHP client + [camera-history] shortcode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tests for client/shortcode run via a stub harness (`php packages/wp-plugin/test/harness.php`), no PHPUnit/WP suite (spec §7); settings/bootstrap validated by `php -l` + repo gates.

**Goal:** Dodat distributovatelný WordPress plugin (`camera-history/`), který embeduje SaaS widget jako iframe přes shortcode `[camera-history camera="…"]`, s admin nastavením (API URL, e-mail, heslo, tenant slug) a dropdownem kamer načteným z existujícího admin API bez jakékoli změny backendu.

**Architecture:** Plugin (čisté PHP, žádný Composer, žádné runtime deps) leží v `packages/wp-plugin/` **mimo** npm workspace globu `packages/*` (design spec §3). Runtime klíče options (prefix `ch_`) jsou definované jako konstanty na `Ch_Client` — jediný zdroj pravdy pro nastavení, client, shortcode i settings. ZIP build je čistý Node skript `scripts/zip-wp-plugin.mjs` (bez deps; `zlib.deflateRawSync` + `zlib.crc32`, deterministický; `zip` binárka na VPS neexistuje).

**Tech Stack:** PHP ≥ 7.4 (testováno i na 8.3.8), WordPress HTTP API (`wp_remote_post`/`wp_remote_get`, timeout 15 s, žádný SSL verride), transient pro JWT tokeny (TTL 2 min), Node 22 pro dist script.

## Global Constraints

- **Stack:** PHP bez Composer deps; `defined('ABSPATH') || exit;` na všech PHP souborech; `Text Domain: camera-history`, escape funkce (`esc_url`, `esc_attr`, `esc_html`, `sanitize_*`) na veškerém výstupu.
- **Option klíče** (prefix `ch_`), konstanty na `Ch_Client::OPT_*`: `ch_api_base_url`, `ch_email`, `ch_password`, `ch_tenant_slug`; transient `ch_tokens` (assoc `access`/`refresh`, TTL 2 min = `Ch_Client::TOKENS_TTL_SECONDS`).
- **Heslo:** nikdy nepsat do logů, nikdy nevypisovat do inputu; prázdná hodnota v políčku = zachovat uložené (sanitize callback vrací starou hodnotu).
- **API kontrakt (využíváme beze změny):** `POST {base}/api/v1/auth/login` JSON `{email,password}` → 200 + Set-Cookie `ch_access`/`ch_refresh`; `POST {base}/api/v1/auth/refresh` s cookie `ch_refresh` → 200 + nový `ch_access`; `GET {base}/api/v1/admin/cameras` s cookie → `{cameras:[{id,name,feedType,status,…}]}`; chyby RFC 7807 `application/problem+json` `detail` → fallback `"Požadavek selhal: {code}"`.
- **Tokeny:** do transientu se ukládají surové JWT (access/refresh); načteme je přes `wp_remote_retrieve_cookie_value` (WP sám parsuje Set-Cookie z odpovědi — kanonický API přístup, neparsujeme hlavičky ručně). Refresh vydává jen nový `ch_access` (design §5), refresh token zůstává zachovaný.
- **Shortcode:** atributy `camera` (povinné), `width` (default `100%`), `height` (default `600`), `theme` (volitelné pass-through `?theme=`); tenant slug z option, NENÍ atribut. Chyba konfigurace → escapovaný `<p class="ch-error">…`, nikdy vyjímka.
- **ZIP:** root ZIP = `camera-history/`; `packages/wp-plugin/dist/` je gitignored (`**/dist/`); deterministický (fixní DOS timestamp) build z `packages/wp-plugin/camera-history/**`. `packages/wp-plugin/` NESMÍ obsahovat `package.json` (workspace glob); testovací harness v `packages/wp-plugin/test/` je mimo plugin složku, do ZIP jde jen `camera-history/`.
- **Testing:** client + shortcode → stub harness (WP stub funkce + fake HTTP API, `php` exit code 0 = PASS). Settings, bootstrap, uninstall, readme → `php -l`. ZIP → strukturní kontrola `python3 -m zipfile` + `testzip()` (žádná CRC chyba). Repo gaty dle design spec §7: `npm run typecheck`, `npm run test`, `npm run lint` (eslint pokrývá i `scripts/*.mjs`; ignores `dist/node_modules/build/legacy`).
- **Žádná změna TS/schema/repo balíků, žádné nové workspace balíky.**

---

### Task 1: Ch_Client + stub harness (login, refresh, list_cameras)

**Files:**
- Create: `packages/wp-plugin/camera-history/includes/class-client.php`
- Create: `packages/wp-plugin/test/harness.php` (stuby + fake HTTP API + testy clienta)

**Interfaces:**
- `Ch_Client`:
  - `const OPT_BASE_URL/OPT_EMAIL/OPT_PASSWORD/OPT_SLUG`, `const TOKENS_KEY='ch_tokens'`, `const TOKENS_TTL_SECONDS=120`
  - `public function login(): true|WP_Error`
  - `public function refresh(): true|WP_Error` (fallback na re-login při neúspěchu)
  - `public function list_cameras(): array|WP_Error` → pole `{id,name,feedType,status}` (jen tyto klíče)

- [ ] **Step 1: Write the tests (harness) — failing by missing class**

Create `packages/wp-plugin/test/harness.php`:

```php
<?php
declare(strict_types=1);

/** Minimalní WP stuby — NE distribuce, pouze lokální testovací harness (spec §7). */

define( 'ABSPATH', 'unittest/' );
$GLOBALS['ch_options'] = array();
$GLOBALS['ch_transients'] = array();
$GLOBALS['ch_http'] = null; // callable(string $method, string $url, array $args): array

function get_option($key, $default = false) { return array_key_exists($key, $GLOBALS['ch_options']) ? $GLOBALS['ch_options'][$key] : $default; }
function set_transient($key, $value, $ttl) { $GLOBALS['ch_transients'][$key] = array('value' => $value, 'ttl' => $ttl); }
function get_transient($key) {
    $t = $GLOBALS['ch_transients'][$key] ?? null;
    if ($t === null) return false;
    if ($t['ttl'] > 0) { $t['ttl']--; $GLOBALS['ch_transients'][$key] = $t; }
    return $t['value'];
}
function delete_transient($key) { unset($GLOBALS['ch_transients'][$key]); }
function untrailingslashit($s) { return rtrim((string) $s, '/'); }
function trailingslashit($s) { return rtrim((string) $s, '/') . '/'; }
function wp_json_encode($data) { return json_encode($data); }
function __($text, $domain = 'default') { return $text; }

class WP_Error {
    public $code;
    public $message;
    public function __construct($code, $message) { $this->code = $code; $this->message = $message; }
    public function get_error_message() { return is_string($this->message) ? $this->message : ''; }
}
function is_wp_error($thing) { return $thing instanceof WP_Error; }

function wp_remote_post($url, $args) { return $GLOBALS['ch_http']('POST', $url, $args); }
function wp_remote_get($url, $args) { return $GLOBALS['ch_http']('GET', $url, $args); }
function wp_remote_retrieve_response_code($response) { return (int) $response['code']; }
function wp_remote_retrieve_body($response) { return $response['body']; }
function wp_remote_retrieve_cookie_value($response, $name) {
    foreach (($response['cookies'] ?? array()) as $c) {
        if ($c->name === $name) return $c->value;
    }
    return '';
}
function wp_remote_retrieve_cookies($response) { return $response['cookies'] ?? array(); }
function wp_parse_args($args, $defaults) { return array_merge($defaults, (array) $args); }

function shortcode_atts($defaults, $atts, $shortcode) { return array_merge($defaults, (array) $atts); }
function add_shortcode($tag, $callback) { $GLOBALS['ch_shortcodes'][$tag] = $callback; }
function esc_url($url) { return htmlspecialchars((string) $url, ENT_QUOTES, 'UTF-8'); }
function esc_attr($str) { return htmlspecialchars((string) $str, ENT_QUOTES, 'UTF-8'); }
function esc_html($str) { return htmlspecialchars((string) $str, ENT_QUOTES, 'UTF-8'); }
function esc_html__($text, $domain = 'default') { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); }

$failures = array();
$asserts = 0;
function check($name, $cond) {
    global $failures, $asserts;
    $asserts++;
    echo ($cond ? 'ok  ' : 'FAIL') . ' - ' . $name . PHP_EOL;
    if (!$cond) $failures[] = $name;
}
function done() {
    global $failures, $asserts;
    if ($failures) {
        echo PHP_EOL . count($failures) . '/' . $asserts . ' assertions FAILED: ' . implode(', ', $failures) . PHP_EOL;
        exit(1);
    }
    echo PHP_EOL . 'PASS (' . $asserts . ' assertions)' . PHP_EOL;
}

// ---- fake HTTP API (reprezentuje runtime kontrakt, design spec §5) ----
function install_fake_api() {
    $GLOBALS['ch_http'] = function ($method, $url, $args) {
        $path = parse_url($url, PHP_URL_PATH);
        $cookies_line = ($args['headers']['Cookie'] ?? '');
        $has = function ($needle) use ($cookies_line) { return strpos($cookies_line, $needle) !== false; };

        if ($method === 'POST' && $path === '/api/v1/auth/login') {
            $body = json_decode($args['body'], true);
            if (($body['email'] ?? '') === 'admin@sengycraft.cz' && ($body['password'] ?? '') === 'secret') {
                return array(
                    'code' => 200,
                    'cookies' => array(
                        (object) array('name' => 'ch_access', 'value' => 'ACCESS-1'),
                        (object) array('name' => 'ch_refresh', 'value' => 'REFRESH-1'),
                    ),
                    'body' => '{"status":"ok"}',
                );
            }
            return array('code' => 401, 'cookies' => array(), 'body' => '{"type":"about:blank","title":"Unauthorized","status":401,"detail":"invalid email or password"}');
        }
        if ($method === 'POST' && $path === '/api/v1/auth/refresh') {
            if (!$has('ch_refresh=REFRESH-1')) {
                return array('code' => 401, 'cookies' => array(), 'body' => '{"detail":"missing refresh token"}');
            }
            return array('code' => 200, 'cookies' => array((object) array('name' => 'ch_access', 'value' => 'ACCESS-2')), 'body' => '{"status":"ok"}');
        }
        if ($method === 'GET' && $path === '/api/v1/admin/cameras') {
            if (!$has('ch_access=ACCESS-1') && !$has('ch_access=ACCESS-2')) {
                return array('code' => 401, 'cookies' => array(), 'body' => '{"detail":"invalid access token"}');
            }
            return array(
                'code' => 200,
                'cookies' => array(),
                'body' => '{"cameras":[{"id":"cam-1","name":"Main","feedType":"static_url","status":"operational","extra":"ignored"},{"id":"cam-2","name":"Park","feedType":"mjpeg","status":"offline","extra":"x"}]}',
            );
        }
        return array('code' => 404, 'cookies' => array(), 'body' => '{"detail":"no route"}');
    };
}

require dirname(__DIR__) . '/camera-history/includes/class-client.php';

function fresh_client() { return new Ch_Client(); }

install_fake_api();

// ---- case 1: success path bez předchozích tokenů ----
$GLOBALS['ch_options'] = array(
    Ch_Client::OPT_BASE_URL => 'https://camera.sengycraft.cz',
    Ch_Client::OPT_EMAIL => 'admin@sengycraft.cz',
    Ch_Client::OPT_PASSWORD => 'secret',
);
$cameras = fresh_client()->list_cameras();
check('list_cameras success returns array', is_array($cameras));
check('list_cameras keeps only 4 fields', isset($cameras[0]['id'], $cameras[0]['name'], $cameras[0]['feedType'], $cameras[0]['status']) && !isset($cameras[0]['extra']));
check('list_cameras maps feedType', $cameras[0]['feedType'] === 'static_url');
check('list_cameras order + second camera', count($cameras) === 2 && $cameras[1]['status'] === 'offline');
$tokens = get_transient(Ch_Client::TOKENS_KEY);
check('login stored tokens transient', is_array($tokens) && $tokens['access'] === 'ACCESS-1' && $tokens['refresh'] === 'REFRESH-1');

// ---- case 2: prošlé/missing access vyvolá refresh (ne re-login) ----
$GLOBALS['ch_transients'][Ch_Client::TOKENS_KEY] = array('value' => array('access' => 'EXPIRED', 'refresh' => 'REFRESH-1'), 'ttl' => 120);
$cameras = fresh_client()->list_cameras();
check('list_cameras refresh-on-401 returns cameras', is_array($cameras) && $cameras[1]['name'] === 'Park');

// ---- case 3: špatné heslo → WP_Error s detail z RFC 7807 ----
$GLOBALS['ch_options'][Ch_Client::OPT_PASSWORD] = 'wrong';
$GLOBALS['ch_transients'] = array();
$err = fresh_client()->list_cameras();
check('bad credentials returns WP_Error', is_wp_error($err));
check('bad credentials message carries detail', $err->get_error_message() === 'invalid email or password');
$GLOBALS['ch_options'][Ch_Client::OPT_PASSWORD] = 'secret';

// ---- case 4: chybějící config → WP_Error (ne vyjímka) ----
$GLOBALS['ch_options'] = array(
    Ch_Client::OPT_BASE_URL => '',
    Ch_Client::OPT_EMAIL => '',
    Ch_Client::OPT_PASSWORD => '',
);
$err = fresh_client()->list_cameras();
check('missing config returns WP_Error', is_wp_error($err) && $err->get_error_message() !== '');

done();
```

Note: nezahrnovat `different_time:` placeholder (redakční artefakt). Kód končí `done();`.

- [ ] **Step 2: Run harness to verify it fails**

Run: `php packages/wp-plugin/test/harness.php`
Expected: `PHP Fatal error: Uncaught Error: Class "Ch_Client" not found` (class-client.php zatím neexistuje — harness vyžaduje soubor, ten `require` selže). To je failing state.

- [ ] **Step 3: Implement Ch_Client**

Create `packages/wp-plugin/camera-history/includes/class-client.php`:

```php
<?php
/**
 * HTTP klient pro Camera History admin API.
 *
 * Žádné Composer deps, pouze WP HTTP API + transient. Tokeny z Set-Cookie
 * čteme přes wp_remote_retrieve_cookie_value (WP samo parsuje odpověď).
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Client {

	const OPT_BASE_URL  = 'ch_api_base_url';
	const OPT_EMAIL     = 'ch_email';
	const OPT_PASSWORD  = 'ch_password';
	const OPT_SLUG      = 'ch_tenant_slug';

	const TOKENS_KEY         = 'ch_tokens';
	const TOKENS_TTL_SECONDS = 120;
	const REQUEST_TIMEOUT    = 15;

	/**
	 * POST /api/v1/auth/login → uloží ch_access/ch_refresh do transientu.
	 *
	 * @return true|WP_Error
	 */
	public function login() {
		$base     = untrailingslashit( (string) get_option( self::OPT_BASE_URL, '' ) );
		$email    = (string) get_option( self::OPT_EMAIL, '' );
		$password = (string) get_option( self::OPT_PASSWORD, '' );

		if ( $base === '' || $email === '' || $password === '' ) {
			return new WP_Error( 'ch_missing_config', __( 'Camera History: vyplňte API URL, e-mail a heslo v nastavení.', 'camera-history' ) );
		}

		$response = wp_remote_post(
			$base . '/api/v1/auth/login',
			array(
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode( array( 'email' => $email, 'password' => $password ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			return new WP_Error( 'ch_login_failed', $this->error_message( $response, $code ) );
		}

		$access  = $this->cookie_value( $response, 'ch_access' );
		$refresh = $this->cookie_value( $response, 'ch_refresh' );
		if ( $access === null || $refresh === null ) {
			return new WP_Error( 'ch_missing_cookies', __( 'Camera History: přihlášení nevrátilo přístupové cookies.', 'camera-history' ) );
		}

		$this->store_tokens( $access, $refresh );
		return true;
	}

	/**
	 * POST /api/v1/auth/refresh → nový ch_access. Neúspěch → plný re-login.
	 *
	 * @return true|WP_Error
	 */
	public function refresh() {
		$tokens = $this->get_tokens();
		if ( ! is_array( $tokens ) || empty( $tokens['refresh'] ) ) {
			return $this->login();
		}

		$base = untrailingslashit( (string) get_option( self::OPT_BASE_URL, '' ) );
		$response = wp_remote_post(
			$base . '/api/v1/auth/refresh',
			array(
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => array( 'Cookie' => 'ch_refresh=' . rawurlencode( $tokens['refresh'] ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			return $this->login();
		}

		$access = $this->cookie_value( $response, 'ch_access' );
		if ( $access === null ) {
			return new WP_Error( 'ch_missing_access', __( 'Camera History: refresh nevrátil access cookie.', 'camera-history' ) );
		}

		$this->store_tokens( $access, $tokens['refresh'] );
		return true;
	}

	/**
	 * GET /api/v1/admin/cameras → seznam {id,name,feedType,status}.
	 * 401 → refresh (a při neúspěchu re-login) → jeden retry.
	 *
	 * @return array|WP_Error
	 */
	public function list_cameras() {
		$base = untrailingslashit( (string) get_option( self::OPT_BASE_URL, '' ) );
		if ( $base === '' ) {
			return new WP_Error( 'ch_missing_config', __( 'Camera History: nastavte API URL v nastavení.', 'camera-history' ) );
		}

		$tokens = $this->get_tokens();
		if ( ! is_array( $tokens ) ) {
			$result = $this->login();
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			$tokens = $this->get_tokens();
		}
		if ( ! is_array( $tokens ) ) {
			return new WP_Error( 'ch_missing_tokens', __( 'Camera History: chybí přihlašovací tokeny.', 'camera-history' ) );
		}

		$response = $this->request_cameras( $base, $tokens );
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		if ( (int) wp_remote_retrieve_response_code( $response ) === 401 ) {
			$result = $this->refresh(); // fallback na re-login uvnitř
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			$tokens = $this->get_tokens();
			if ( ! is_array( $tokens ) ) {
				return new WP_Error( 'ch_missing_tokens', __( 'Camera History: chybí přihlašovací tokeny.', 'camera-history' ) );
			}
			$response = $this->request_cameras( $base, $tokens );
			if ( is_wp_error( $response ) ) {
				return $response;
			}
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			return new WP_Error( 'ch_cameras_failed', $this->error_message( $response, $code ) );
		}

		$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$list = isset( $body['cameras'] ) && is_array( $body['cameras'] ) ? $body['cameras'] : array();

		return array_values(
			array_filter(
				array_map(
					function ( $camera ) {
						if ( ! is_array( $camera ) || empty( $camera['id'] ) ) {
							return null;
						}
						return array(
							'id'       => (string) $camera['id'],
							'name'     => isset( $camera['name'] ) ? (string) $camera['name'] : '',
							'feedType' => isset( $camera['feedType'] ) ? (string) $camera['feedType'] : '',
							'status'   => isset( $camera['status'] ) ? (string) $camera['status'] : '',
						);
					},
					$list
				)
			)
		);
	}

	/** @internal */
	private function request_cameras( $base, array $tokens ) {
		return wp_remote_get(
			$base . '/api/v1/admin/cameras',
			array(
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => array( 'Cookie' => $this->cookie_header( $tokens ) ),
			)
		);
	}

	/** @internal */
	private function cookie_header( array $tokens ) {
		$parts = array( 'ch_access=' . rawurlencode( $tokens['access'] ) );
		if ( ! empty( $tokens['refresh'] ) ) {
			$parts[] = 'ch_refresh=' . rawurlencode( $tokens['refresh'] );
		}
		return implode( '; ', $parts );
	}

	/** @internal */
	private function cookie_value( $response, $name ) {
		$value = wp_remote_retrieve_cookie_value( $response, $name );
		return ( is_string( $value ) && $value !== '' ) ? $value : null;
	}

	/** @internal */
	private function store_tokens( $access, $refresh ) {
		set_transient(
			self::TOKENS_KEY,
			array( 'access' => $access, 'refresh' => $refresh ),
			self::TOKENS_TTL_SECONDS
		);
	}

	/** @internal */
	private function get_tokens() {
		$tokens = get_transient( self::TOKENS_KEY );
		return ( is_array( $tokens ) && ! empty( $tokens['access'] ) ) ? $tokens : null;
	}

	/** @internal */
	private function error_message( $response, $code ) {
		$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( is_array( $body ) && isset( $body['detail'] ) && is_string( $body['detail'] ) && $body['detail'] !== '' ) {
			return $body['detail'];
		}
		return sprintf( __( 'Požadavek selhal: %d', 'camera-history' ), $code );
	}
}
```

- [ ] **Step 4: Run harness to verify it passes**

Run: `php packages/wp-plugin/test/harness.php`
Expected: `done();` outputs `PASS (N assertions)`, exit code 0. All case-1..4 checks `ok`.

- [ ] **Step 5: php -l + commit**

Run: `php -l packages/wp-plugin/camera-history/includes/class-client.php && php -l packages/wp-plugin/test/harness.php`
Expected: both print `No syntax errors detected`.

```bash
git add packages/wp-plugin/camera-history/includes/class-client.php packages/wp-plugin/test/harness.php
git commit -m "feat(plugin): Ch_Client with login, refresh, listCameras"
```

---

### Task 2: Ch_Shortcode (iframe render) + harness tests

**Files:**
- Create: `packages/wp-plugin/camera-history/includes/class-shortcode.php`
- Modify: `packages/wp-plugin/test/harness.php` (přidat require + shortcode testy)

**Interfaces:**
- `Ch_Shortcode`:
  - `public static function register()` — `add_shortcode('camera-history', [__CLASS__, 'render'])`
  - `public static function render($atts): string` — escapovaný iframe `<p class="ch-error">` fallback

- [ ] **Step 1: Extend harness (failing test)**

Append before `done();` in `packages/wp-plugin/test/harness.php`:

```php
// ---- shortcode tests ----
require dirname(__DIR__) . '/camera-history/includes/class-shortcode.php';
Ch_Shortcode::register();

$GLOBALS['ch_options'] = array(
    Ch_Client::OPT_BASE_URL => 'https://camera.sengycraft.cz',
    Ch_Client::OPT_SLUG => 'acme-basins',
);
$html = Ch_Shortcode::render(array('camera' => 'cam-1'));
check('shortcode builds iframe src', strpos($html, 'src="https://camera.sengycraft.cz/widget/acme-basins/cam-1"') !== false);
check('shortcode defaults width/height', strpos($html, 'width="100%"') !== false && strpos($html, 'height="600"') !== false);
check('shortcode includes iframe attrs', strpos($html, 'allowfullscreen') !== false && strpos($html, 'loading="lazy"') !== false);

$dark = Ch_Shortcode::render(array('camera' => 'cam-1', 'theme' => 'dark'));
check('shortcode theme pass-through', strpos($dark, '?theme=dark') !== false);

$missing = Ch_Shortcode::render(array('camera' => ''));
check('shortcode missing camera → ch-error', strpos($missing, 'ch-error') !== false && strpos($missing, '<iframe') === false);

// reset config → error path
$GLOBALS['ch_options'] = array(Ch_Client::OPT_BASE_URL => '', Ch_Client::OPT_SLUG => '');
$nocfg = Ch_Shortcode::render(array('camera' => 'cam-1'));
check('shortcode missing config → ch-error', strpos($nocfg, 'ch-error') !== false && strpos($nocfg, '<iframe') === false);
```

- [ ] **Step 2: Run harness to verify it fails**

Run: `php packages/wp-plugin/test/harness.php`
Expected: `PHP Fatal error: Class "Ch_Shortcode" not found`.

- [ ] **Step 3: Implement Ch_Shortcode**

Create `packages/wp-plugin/camera-history/includes/class-shortcode.php`:

```php
<?php
/**
 * [camera-history camera="…" width="…" height="…" theme="…"] → iframe widgetu.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Shortcode {

	/**
	 * @return void
	 */
	public static function register() {
		add_shortcode( 'camera-history', array( __CLASS__, 'render' ) );
	}

	/**
	 * @param array|string $atts Shortcode atributy.
	 * @return string
	 */
	public static function render( $atts ) {
		$options = shortcode_atts(
			array(
				'camera' => '',
				'width'  => '100%',
				'height' => '600',
				'theme'  => '',
			),
			$atts,
			'camera-history'
		);

		$base = untrailingslashit( (string) get_option( Ch_Client::OPT_BASE_URL, '' ) );
		$slug = (string) get_option( Ch_Client::OPT_SLUG, '' );
		$camera = trim( (string) $options['camera'] );

		if ( $base === '' || $slug === '' || $camera === '' ) {
			return '<p class="ch-error">' . esc_html__( 'Camera History: plugin není nakonfigurovaný (API URL, tenant slug) nebo chybí ID kamery.', 'camera-history' ) . '</p>';
		}

		$url = $base . '/widget/' . rawurlencode( $slug ) . '/' . rawurlencode( $camera );
		if ( (string) $options['theme'] !== '' ) {
			$url .= '?theme=' . rawurlencode( (string) $options['theme'] );
		}

		return sprintf(
			'<iframe src="%s" width="%s" height="%s" style="border:0" allowfullscreen loading="lazy"></iframe>',
			esc_url( $url ),
			esc_attr( $options['width'] ),
			esc_attr( $options['height'] )
		);
	}
}
```

- [ ] **Step 4: Run harness to verify it passes**

Run: `php packages/wp-plugin/test/harness.php`
Expected: `PASS (… assertions)`, exit code 0. Pozor: harness `esc_attr` používá `htmlspecialchars`, takže `%` a `=` zůstanou; `?theme=dark` match ok.

- [ ] **Step 5: php -l + commit**

```bash
php -l packages/wp-plugin/camera-history/includes/class-shortcode.php
git add packages/wp-plugin/camera-history/includes/class-shortcode.php packages/wp-plugin/test/harness.php
git commit -m "feat(plugin): camera-history shortcode → escaped iframe"
```

---

### Task 3: Ch_Settings (admin page, sanitizace, dropdown kamer)

**Files:**
- Create: `packages/wp-plugin/camera-history/includes/class-settings.php`

**Interfaces:**
- `Ch_Settings`:
  - `const GROUP = 'camera_history_settings'`
  - `public static function init()` — `admin_menu` (submenu do Settings) + `admin_init` (register_setting × 4 s nonce via `settings_fields`)
  - `santize_*` callbacks: `sanitize_url` (esc_url_raw + ořez trail slash + must `https://`), `sanitize_email`, `sanitize_password` (empty → zachovat), `sanitize_slug` (sanitize_title)
  - `render_page()` — `current_user_can('manage_options')`; dropdown z `list_cameras()`; chyba → escapovaný `notice-error` div (RFC 7807 detail)

- [ ] **Step 1: Implement Ch_Settings**

Create `packages/wp-plugin/camera-history/includes/class-settings.php`:

```php
<?php
/**
 * Správcovská stránka Camera History (Settings → Camera History).
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Settings {

	const GROUP = 'camera_history_settings';

	/**
	 * @return void
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
	}

	/**
	 * @return void
	 */
	public static function register_menu() {
		add_options_page(
			__( 'Camera History', 'camera-history' ),
			__( 'Camera History', 'camera-history' ),
			'manage_options',
			'camera-history',
			array( __CLASS__, 'render_page' )
		);
	}

	/**
	 * @return void
	 */
	public static function register_settings() {
		register_setting(
			self::GROUP,
			Ch_Client::OPT_BASE_URL,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_url' ) )
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_EMAIL,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_email' ) )
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_PASSWORD,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_password' ) )
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_SLUG,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_slug' ) )
		);
	}

	/**
	 * @param mixed $value
	 * @return string
	 */
	public static function sanitize_url( $value ) {
		$value = untrailingslashit( esc_url_raw( trim( (string) $value ) ) );
		return ( strpos( $value, 'https://' ) === 0 ) ? $value : '';
	}

	/**
	 * @param mixed $value
	 * @return string
	 */
	public static function sanitize_email( $value ) {
		return sanitize_email( trim( (string) $value ) );
	}

	/**
	 * Prázdná hodnota = ponechat uložené heslo. Nikdy se nezobrazuje.
	 *
	 * @param mixed $value
	 * @return string
	 */
	public static function sanitize_password( $value ) {
		$value = (string) $value;
		if ( $value === '' ) {
			return (string) get_option( Ch_Client::OPT_PASSWORD, '' );
		}
		return $value;
	}

	/**
	 * @param mixed $value
	 * @return string
	 */
	public static function sanitize_slug( $value ) {
		return sanitize_title( (string) $value );
	}

	/**
	 * @return void
	 */
	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$cameras = ( new Ch_Client() )->list_cameras();
		$error   = is_wp_error( $cameras ) ? $cameras->get_error_message() : '';

		if ( $error !== '' ) {
			echo '<div class="notice notice-error"><p>' . esc_html( $error ) . '</p></div>';
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Camera History', 'camera-history' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="ch_api_base_url"><?php esc_html_e( 'API URL', 'camera-history' ); ?></label></th>
						<td>
							<input type="url" class="regular-text" id="ch_api_base_url"
								name="<?php echo esc_attr( Ch_Client::OPT_BASE_URL ); ?>"
								value="<?php echo esc_attr( get_option( Ch_Client::OPT_BASE_URL, '' ) ); ?>"
								placeholder="https://camera.sengycraft.cz" />
							<p class="description"><?php esc_html_e( 'Musí začínat https://.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_email"><?php esc_html_e( 'E-mail', 'camera-history' ); ?></label></th>
						<td>
							<input type="email" class="regular-text" id="ch_email"
								name="<?php echo esc_attr( Ch_Client::OPT_EMAIL ); ?>"
								value="<?php echo esc_attr( get_option( Ch_Client::OPT_EMAIL, '' ) ); ?>" />
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_password"><?php esc_html_e( 'Heslo', 'camera-history' ); ?></label></th>
						<td>
							<input type="password" class="regular-text" id="ch_password"
								name="<?php echo esc_attr( Ch_Client::OPT_PASSWORD ); ?>" autocomplete="new-password"
								placeholder="<?php echo esc_attr( __( 'zachovat stávající', 'camera-history' ) ); ?>" />
							<p class="description"><?php esc_html_e( 'Heslo se nikdy nezobrazuje; prázdné políčko zachová uložené heslo.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_tenant_slug"><?php esc_html_e( 'Tenant slug', 'camera-history' ); ?></label></th>
						<td>
							<input type="text" class="regular-text" id="ch_tenant_slug"
								name="<?php echo esc_attr( Ch_Client::OPT_SLUG ); ?>"
								value="<?php echo esc_attr( get_option( Ch_Client::OPT_SLUG, '' ) ); ?>"
								placeholder="např. acme-basins" />
							<p class="description"><?php esc_html_e( 'Slug tenanta (vidíte ho v admin URL). Použije se v URL widgetu.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Výběr kamery', 'camera-history' ); ?></th>
						<td>
							<?php if ( $error !== '' ) : ?>
								<p class="description"><?php esc_html_e( 'Seznam kamer se nepodařilo načíst (viz chyba výše).', 'camera-history' ); ?></p>
							<?php elseif ( empty( $cameras ) ) : ?>
								<p class="description"><?php esc_html_e( 'Žádné kamery. Vytvořte kameru v adminu.', 'camera-history' ); ?></p>
							<?php else : ?>
								<select id="ch-camera-pick">
									<?php foreach ( $cameras as $camera ) : ?>
										<option value="<?php echo esc_attr( $camera['id'] ); ?>">
											<?php echo esc_html( $camera['name'] . ' (' . $camera['feedType'] . ', ' . $camera['status'] . ')' ); ?>
										</option>
									<?php endforeach; ?>
								</select>
								<p class="description">
									<?php esc_html_e( 'Shortcode pro vybranou kameru:', 'camera-history' ); ?>
									<input type="text" readonly class="regular-text code" id="ch-shortcode" />
								</p>
								<script>
								(function () {
									var pick = document.getElementById('ch-camera-pick');
									var out = document.getElementById('ch-shortcode');
									if (!pick || !out) return;
									function update() {
										out.value = '[camera-history camera="' + pick.value + '"]';
									}
									pick.addEventListener('change', update);
									update();
								})();
								</script>
							<?php endif; ?>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
```

Poznámka k sanitize_email: `sanitize_email` vrací prázdný string pro nevalidní vstup — zachováváme ho jako ''; prázdný e-mail povede k `ch_missing_config` na frontend straně clienta. (Nepoužíváme "zachovat starou" — e-mail je viditelný a uživatel ho vidí, takže '' je srozumitelné.)

- [ ] **Step 2: Test s php -l**

Run:
```bash
php -l packages/wp-plugin/camera-history/includes/class-settings.php
```
Expected: `No syntax errors detected`.

- [ ] **Step 3: Commit**

```bash
git add packages/wp-plugin/camera-history/includes/class-settings.php
git commit -m "feat(plugin): admin settings page with camera dropdown"
```

---

### Task 4: Bootstrap + uninstall + readme

**Files:**
- Create: `packages/wp-plugin/camera-history/camera-history.php`
- Create: `packages/wp-plugin/camera-history/uninstall.php`
- Create: `packages/wp-plugin/camera-history/readme.txt`

**Interfaces:**
- `camera-history.php` je plugin root: hlavička, `defined('ABSPATH') || exit;`, konstanty `CH_PLUGIN_FILE`/`CH_PLUGIN_DIR`, require tříd v pořadí client → shortcode → settings, init na `plugins_loaded`.
- `uninstall.php`: `WP_UNINSTALL_PLUGIN` guard + `delete_option` na všech `Ch_Client::OPT_*` + `delete_transient('ch_tokens')`.
- `readme.txt`: standardní WP readme (viz sekce popis/instalace).

- [ ] **Step 1: Implement bootstrap**

Create `packages/wp-plugin/camera-history/camera-history.php`:

```php
<?php
/**
 * Plugin Name: Camera History
 * Description: Vkládá widget Camera History SaaS (iframe) přes shortcode [camera-history camera="…"].
 * Version: 1.0.0
 * Author: Camera History
 * Text Domain: camera-history
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

defined( 'ABSPATH' ) || exit;

define( 'CH_PLUGIN_FILE', __FILE__ );
define( 'CH_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

require_once CH_PLUGIN_DIR . 'includes/class-client.php';
require_once CH_PLUGIN_DIR . 'includes/class-shortcode.php';
require_once CH_PLUGIN_DIR . 'includes/class-settings.php';

add_action(
	'plugins_loaded',
	static function () {
		Ch_Shortcode::register();
		Ch_Settings::init();
	}
);
```

- [ ] **Step 2: Implement uninstall**

Create `packages/wp-plugin/camera-history/uninstall.php`:

```php
<?php
/**
 * Uninstall: vyčistí options a transient.
 *
 * @package CameraHistory
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'ch_api_base_url' );
delete_option( 'ch_email' );
delete_option( 'ch_password' );
delete_option( 'ch_tenant_slug' );
delete_transient( 'ch_tokens' );
```

Poznámka: stringové klíče v `uninstall.php` uvádíme doslova namísto konstant `Ch_Client::OPT_*` — při odinstalaci WordPress načte hlavní plugin file (a tím i `class-client.php`), takže by konstanty fungovaly, ale stringy jsou neměnný veřejný kontrakt s option tabulkou a `uninstall.php` zůstává samostatně čitelný.

- [ ] **Step 3: Implement readme**

Create `packages/wp-plugin/camera-history/readme.txt`:

```
=== Camera History ===
Contributors: camera-history
Tags: video, camera, widget
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Vkládá widget Camera History SaaS (historii snímků kamer) do příspěvků a stránek jako responzivní iframe.

== Description ==

Camera History je plugin pro WordPress, který vloží widget Camera History
SaaS do jakékoliv stránky nebo příspěvku pomocí shortcodu:

`[camera-history camera="ID_KAMERY"]`

Nastavení najdete v **Settings → Camera History**: vyplníte API URL,
e-mail a heslo do SaaS admin účtu a tenant slug. Plugin se připojí k admin
API, načte seznam kamer a zobrazí je v rozbalovacím seznamu — vyberte
kameru a zkopírujte vygenerovaný shortcode.

Vlastnosti:

* Žádné Composer závislosti, žádné secrets v logách.
* Heslo se nikdy nezobrazuje (prázdné políčko = zachovat uložené).
* Volitelné atributy shortcodu: `width` (default 100%), `height` (default 600), `theme`.

== Installation ==

1. V administraci jděte na **Plugins → Add New → Upload Plugin**.
2. Nahrajte `camera-history.zip` a klikněte na **Install Now**.
3. Aktivujte plugin.
4. Jděte na **Settings → Camera History** a vyplňte API URL, e-mail,
   heslo a tenant slug.
5. Vložte `[camera-history camera="…"]` do stránky nebo příspěvku.

== Frequently Asked Questions ==

= Kde najdu ID kamery? =
Na stránce **Settings → Camera History** vyberte kameru v seznamu —
shortcode se vygeneruje v poli vedle seznamu.

= Co je tenant slug? =
Slug tenanta je součást URL widgetu (`/widget/{tenant_slug}/{camera_id}`).
Najdete ho v admin adrese nebo v nastavení tenanta v SaaS.

== Changelog ==

= 1.0.0 =
* První vydání: admin settings, login přes admin API, dropdown kamer, shortcode.
```

- [ ] **Step 4: Test + commit**

Run:
```bash
php -l packages/wp-plugin/camera-history/camera-history.php
php -l packages/wp-plugin/camera-history/uninstall.php
# readme.txt je textový — php -l se nepoužívá
```
Expected: both `No syntax errors detected`.

```bash
git add packages/wp-plugin/camera-history
git commit -m "feat(plugin): bootstrap, uninstall, readme"
```

---

### Task 5: ZIP build script + structure verification + repo gates + README M3

**Files:**
- Create: `scripts/zip-wp-plugin.mjs`
- Modify: `README.md` (sekce M3 — install, konfigurace, shortcode, zip build)

**Interfaces:**
- `node scripts/zip-wp-plugin.mjs` → `packages/wp-plugin/dist/camera-history.zip` (root `camera-history/`, deterministický, testováno `python3 -m zipfile -t`).
- `packages/wp-plugin/dist/` je gitignored (`**/dist/`).

- [ ] **Step 1: Implement zip script**

Create `scripts/zip-wp-plugin.mjs`:

```js
#!/usr/bin/env node
// Bez deps ZIP writer pro WordPress plugin (root má být `camera-history/`).
// Využívá zlib.crc32 + deflateRawSync (Node >= 22.2; VPS má v22.23.2).
// Deterministický: fixní DOS timestamp, seřazený seznam souborů.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "packages", "wp-plugin", "camera-history");
const OUT_DIR = join(ROOT, "packages", "wp-plugin", "dist");
const OUT_FILE = join(OUT_DIR, "camera-history.zip");

// zlib.crc32 vyžaduje Node >= 22.2. Root engines>=20, proto explicitní guard
// místo polyfillu (VPS má v22.23.2).
if (typeof crc32 !== "function") {
  throw new Error("zlib.crc32 neni dostupny (potreba Node >= 22.2)");
}

function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full).split(sep).join("/");
    if (statSync(full).isDirectory()) {
      out.push(rel + "/");
      out.push(...collectFiles(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

// entries: { name (path uvnitř ZIP), full (disk path) }
const entries = collectFiles(SRC).map((rel) => ({
  name: "camera-history/" + rel,
  // rel končí "/" pro adresáře → vadný join: uložíme i čistý disk path
  full: rel.endsWith("/") ? join(SRC, rel.slice(0, -1)) : join(SRC, rel),
}));

const DOS_DATE = 0x5d38; // 2026-09-24 (deterministický)

function localHeader(nameBuf, crc, method, compressed, size) {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // version needed
  h.writeUInt16LE(0x0800, 6); // UTF-8 flag
  h.writeUInt16LE(method, 8);
  h.writeUInt16LE(0, 10); // time
  h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(compressed.length, 18);
  h.writeUInt32LE(size, 22);
  h.writeUInt16LE(nameBuf.length, 26);
  h.writeUInt16LE(0, 28);
  return h;
}

function centralHeader(nameBuf, crc, method, compressed, size, offset) {
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4); // version made by
  c.writeUInt16LE(20, 6); // version needed
  c.writeUInt16LE(0x0800, 8); // UTF-8 flag
  c.writeUInt16LE(method, 10);
  c.writeUInt16LE(0, 12); // time
  c.writeUInt16LE(DOS_DATE, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(compressed.length, 20);
  c.writeUInt32LE(size, 24);
  c.writeUInt16LE(nameBuf.length, 28);
  c.writeUInt16LE(0, 30); // extra
  c.writeUInt16LE(0, 32); // comment
  c.writeUInt16LE(0, 34); // disk start
  c.writeUInt16LE(0, 36); // internal attrs
  c.writeUInt32LE(0, 38); // external attrs
  c.writeUInt32LE(offset, 42);
  return c;
}

function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const { name, full } = entry;
    const nameBuf = Buffer.from(name, "utf8");
    const isDir = name.endsWith("/");
    const data = isDir ? Buffer.alloc(0) : readFileSync(full);
    const method = isDir ? 0 : 8;
    const compressed = isDir ? Buffer.alloc(0) : deflateRawSync(data);
    const crc = isDir ? 0 : crc32(data);

    local.push(Buffer.concat([localHeader(nameBuf, crc, method, compressed, data.length), nameBuf, compressed]));
    central.push(Buffer.concat([centralHeader(nameBuf, crc, method, compressed, data.length, offset), nameBuf]));
    offset += 30 + nameBuf.length + compressed.length;
  }

  const cdStart = offset;
  const cdSize = central.reduce((sum, b) => sum + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // cd start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...local, ...central, eocd]);
}

const zip = buildZip(entries);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, zip);

console.log(`camera-history.zip: ${entries.length} entries, ${zip.length} bytes`);
for (const e of entries) console.log(`  ${e.name}`);
```

Poznámka (implementer): zkontroluj odsazení/EOF marca (`\n` na konci souboru — GitHub/media konvence).

- [ ] **Step 2: Build + structure verification**

Run:
```bash
node scripts/zip-wp-plugin.mjs
python3 -m zipfile -t packages/wp-plugin/dist/camera-history.zip
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile('packages/wp-plugin/dist/camera-history.zip')
names = z.namelist()
expected = {
    'camera-history/camera-history.php',
    'camera-history/uninstall.php',
    'camera-history/readme.txt',
    'camera-history/includes/class-client.php',
    'camera-history/includes/class-settings.php',
    'camera-history/includes/class-shortcode.php',
}
missing = expected - set(names)
extra = [n for n in names if not n.startswith('camera-history/')]
assert not missing, f'missing entries: {sorted(missing)}'
assert not extra, f'entries outside camera-history/: {extra}'
assert z.testzip() is None, 'CRC mismatch'
print('structure OK:', len(names), 'entries')
PY
```
Expected: `node` script prints entry tree; `python3 -m zipfile -t` prints `Testing: OK` (`camera-history.zip is OK` skips on quiet?) — fine if exit 0; structure block prints `structure OK`.

Note: if `zlib.crc32` missing (Node < 22.2), build fails — do NOT polyfill, raise an error message; engines=groot node>=20, VPS má 22.23.2, CI dokumentujeme.

- [ ] **Step 3: Repo gates**

Run (root):
```bash
npm install
npm run typecheck
npm run test
npm run lint
```
Expected: all PASS. Důležité: `packages/wp-plugin/` nemá `package.json`, npm workspaces glob ho ignoruje (design §3); eslint lintuje `scripts/zip-wp-plugin.mjs` (root `eslint .`), služby `npm` neúčne nově workspace balíček.

Control: `npm ls --workspaces --depth=0` NEvypíše `@ch/wp-plugin` (musí v workspace zůstat jen core, db, worker, api, web, admin).

- [ ] **Step 4: README M3 section**

Modify `README.md` — append sekci (za existující M2 obsah). Vnitřní fence jsou 3-backtick, vnější blok proto označ 4-backtick fence (````markdown):

````markdown
## WordPress plugin (M3)

Thin WP plugin, který embeduje widget jako iframe přes shortcode. Zdroj: `packages/wp-plugin/camera-history/`
(čisté PHP, žádný Composer). Není součástí npm workspace.

### Build distribučního ZIP

```bash
node scripts/zip-wp-plugin.mjs   # → packages/wp-plugin/dist/camera-history.zip
```

### Instalace a konfigurace (manuální smoke, mimo repo)

1. Nahrajte `packages/wp-plugin/dist/camera-history.zip` přes **Plugins → Add New → Upload Plugin** a aktivujte.
2. **Settings → Camera History**: vyplňte API URL (např. `https://camera.sengycraft.cz`), e-mail a heslo
   do SaaS admin účtu a tenant slug.
3. Vyberte kameru z dropdownu (seznam z `GET /api/v1/admin/cameras`) a zkopírujte shortcode
   `[camera-history camera="…"]`.
4. Vložte shortcode do stránky/příspěvku. Volitelné atributy: `width` (100%), `height` (600), `theme`.

### Testy pluginu

```bash
php packages/wp-plugin/test/harness.php   # stub harness clienta + shortcodu (bez PHPUnit/WP)
php -l packages/wp-plugin/camera-history/*.php packages/wp-plugin/camera-history/includes/*.php
```
````

- [ ] **Step 5: Tight check — plugin dirs NOT in workspace + gates again**

Run:
```bash
git status
npm ls --workspaces --depth=0
php -l packages/wp-plugin/camera-history/*.php packages/wp-plugin/camera-history/includes/*.php packages/wp-plugin/test/harness.php
```
Expected: `git status` only the 7 committed artifacts + scripts/zip-wp-plugin.mjs + README.md (dist/ untracked ignored); workspaces list unchanged; `php -l` all `No syntax errors`.

- [ ] **Step 6: Commit**

```bash
git add scripts/zip-wp-plugin.mjs README.md
git commit -m "feat(plugin): zip dist script and README M3 section"
```

---

## Definition of Done (spec §9)

- [ ] ZIP skript běží a vyrobí `packages/wp-plugin/dist/camera-history.zip` se správnou strukturou (Verification u Task 5 step 2). `dist/` zůstává gitignored.
- [ ] `php -l` 0 chyb na všech `.php` souborech (client, shortcode, settings, bootstrap, uninstall, harness).
- [ ] Stub harness PASS: login/refresh/re-login, mapování polí, RFC 7807 detail, shortcode URL a `ch-error` fallback.
- [ ] Repo gaty (`npm run typecheck && npm run test && npm run lint`) PASS; workspace identické (wp-plugin mimo `packages/*` glob — nemá package.json); zip skript eslint čistý.
- [ ] README obsahuje sekci M3 (install, konfigurace, shortcode, zip build, testy).
- [ ] Manuální installflow popsán v README; reálná WP instalace je na uživateli (mimo repo), dle design spec §7.