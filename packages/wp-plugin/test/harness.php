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