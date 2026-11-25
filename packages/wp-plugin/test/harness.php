<?php
declare(strict_types=1);

/** Minimal WordPress stubs for the local plugin harness. */

define( 'ABSPATH', 'unittest/' );
$GLOBALS['ch_options']  = array();
$GLOBALS['ch_scripts']  = array();
$GLOBALS['ch_http']     = null;
$GLOBALS['ch_last_args'] = array();

function get_option( $key, $default = false ) {
	return array_key_exists( $key, $GLOBALS['ch_options'] ) ? $GLOBALS['ch_options'][ $key ] : $default;
}
function delete_option( $key ) { unset( $GLOBALS['ch_options'][ $key ] ); }
function delete_transient( $key ) { unset( $GLOBALS['ch_transients'][ $key ] ); }
function untrailingslashit( $s ) { return rtrim( (string) $s, '/' ); }
function __( $text, $domain = 'default' ) { return $text; }

class WP_Error {
	public $code;
	public $message;
	public function __construct( $code, $message ) {
		$this->code    = $code;
		$this->message = $message;
	}
	public function get_error_message() { return is_string( $this->message ) ? $this->message : ''; }
}
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }

function wp_remote_get( $url, $args ) {
	$GLOBALS['ch_last_args'] = $args;
	return $GLOBALS['ch_http']( 'GET', $url, $args );
}
function wp_remote_retrieve_response_code( $response ) { return (int) $response['code']; }
function wp_remote_retrieve_body( $response ) { return $response['body']; }

function shortcode_atts( $defaults, $atts, $shortcode ) { return array_merge( $defaults, (array) $atts ); }
function add_shortcode( $tag, $callback ) { $GLOBALS['ch_shortcodes'][ $tag ] = $callback; }
function wp_enqueue_script( $handle, $src = '', $deps = array(), $ver = null, $in_footer = false ) {
	if ( ! isset( $GLOBALS['ch_scripts'][ $handle ] ) ) {
		$GLOBALS['ch_scripts'][ $handle ] = array( 'src' => $src, 'ver' => $ver, 'footer' => $in_footer );
	}
}
function did_action( $hook ) { return false; }
function esc_url( $url ) { return htmlspecialchars( (string) $url, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $str ) { return htmlspecialchars( (string) $str, ENT_QUOTES, 'UTF-8' ); }
function esc_html( $str ) { return htmlspecialchars( (string) $str, ENT_QUOTES, 'UTF-8' ); }
function esc_html__( $text, $domain = 'default' ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }

$failures = array();
$asserts  = 0;
function check( $name, $cond ) {
	global $failures, $asserts;
	$asserts++;
	echo ( $cond ? 'ok  ' : 'FAIL' ) . ' - ' . $name . PHP_EOL;
	if ( ! $cond ) $failures[] = $name;
}
function done() {
	global $failures, $asserts;
	if ( $failures ) {
		echo PHP_EOL . count( $failures ) . '/' . $asserts . ' assertions FAILED: ' . implode( ', ', $failures ) . PHP_EOL;
		exit( 1 );
	}
	echo PHP_EOL . 'PASS (' . $asserts . ' assertions)' . PHP_EOL;
}

function install_fake_api() {
	$GLOBALS['ch_http'] = function ( $method, $url, $args ) {
		$path = parse_url( $url, PHP_URL_PATH );
		if ( $method === 'GET' && $path === '/api/v1/public/tenants/acme-basins/cameras' ) {
			return array(
				'code' => 200,
				'body' => '{"cameras":[{"id":"cam-1","name":"Main","slug":"main"},{"id":"cam-2","name":"Park","slug":"park","feedType":"ignored"}]}',
			);
		}
		if ( $path === '/api/v1/public/tenants/missing/cameras' ) {
			return array( 'code' => 404, 'body' => '{"detail":"Workspace not found"}' );
		}
		return array( 'code' => 404, 'body' => '{"detail":"no route"}' );
	};
}

require dirname( __DIR__ ) . '/camera-history/includes/class-client.php';
require dirname( __DIR__ ) . '/camera-history/includes/class-shortcode.php';

install_fake_api();

function fresh_client() { return new Ch_Client(); }

// ---- client: public camera list ----
$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_BASE_URL => 'https://camera.sengycraft.cz',
	Ch_Client::OPT_SLUG     => 'acme-basins',
);
$cameras = fresh_client()->list_cameras();
check( 'list_cameras returns an array', is_array( $cameras ) );
check( 'list_cameras returns two cameras', is_array( $cameras ) && count( $cameras ) === 2 );
check( 'list_cameras keeps id, name and slug', isset( $cameras[0]['id'], $cameras[0]['name'], $cameras[0]['slug'] ) );
check( 'list_cameras ignores extra fields', ! isset( $cameras[1]['feedType'] ) );
check( 'list_cameras does not send a cookie', ! isset( $GLOBALS['ch_last_args']['headers']['Cookie'] ) );
check( 'list_cameras does not send credentials', ! isset( $GLOBALS['ch_last_args']['body'] ) );

// ---- client: missing config ----
$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_BASE_URL => '',
	Ch_Client::OPT_SLUG     => '',
);
$err = fresh_client()->list_cameras();
check( 'missing config returns WP_Error', is_wp_error( $err ) && $err->get_error_message() !== '' );

// ---- client: unknown workspace ----
$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_BASE_URL => 'https://camera.sengycraft.cz',
	Ch_Client::OPT_SLUG     => 'missing',
);
$err = fresh_client()->list_cameras();
check( 'unknown workspace returns WP_Error', is_wp_error( $err ) );
check( 'unknown workspace carries API detail', $err->get_error_message() === 'Workspace not found' );

// ---- shortcode ----
Ch_Shortcode::register();

$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_BASE_URL => 'https://camera.sengycraft.cz',
	Ch_Client::OPT_SLUG     => 'acme-basins',
);
$html = Ch_Shortcode::render( array( 'camera' => 'glacier-bowl' ) );
check( 'shortcode builds iframe src from slug', strpos( $html, 'src="https://camera.sengycraft.cz/widget/acme-basins/glacier-bowl"' ) !== false );
check( 'shortcode defaults width/height', strpos( $html, 'width="100%"' ) !== false && strpos( $html, 'height="720"' ) !== false );
check( 'shortcode includes iframe attrs', strpos( $html, 'allowfullscreen' ) !== false && strpos( $html, 'loading="lazy"' ) !== false );

$old_id = Ch_Shortcode::render( array( 'camera' => 'c28e31f9-96e5-4563-b137-32bc894abea1' ) );
check( 'old camera ID shortcode still works', strpos( $old_id, '/widget/acme-basins/c28e31f9-96e5-4563-b137-32bc894abea1' ) !== false );

$GLOBALS['ch_scripts'] = array();
$first  = Ch_Shortcode::render( array( 'camera' => 'glacier-bowl' ) );
$second = Ch_Shortcode::render( array( 'camera' => 'ridge' ) );
check( 'embed helper enqueued once', isset( $GLOBALS['ch_scripts']['camera-history-embed'] ) && count( $GLOBALS['ch_scripts'] ) === 1 );
check( 'embed helper follows the API base URL', ( $GLOBALS['ch_scripts']['camera-history-embed']['src'] ?? '' ) === 'https://camera.sengycraft.cz/embed.js' );
check( 'embed helper loads in the footer', ( $GLOBALS['ch_scripts']['camera-history-embed']['footer'] ?? false ) === true );
check( 'embed helper has no version query', ( $GLOBALS['ch_scripts']['camera-history-embed']['ver'] ?? null ) === null );
check( 'second shortcode renders its own iframe', strpos( $second, 'ridge' ) !== false );
check( 'shortcode does not inline the helper before wp_footer', strpos( $first, '<script' ) === false );

$dark = Ch_Shortcode::render( array( 'camera' => 'glacier-bowl', 'theme' => 'dark' ) );
check( 'shortcode theme pass-through', strpos( $dark, '?theme=dark' ) !== false );

$missing = Ch_Shortcode::render( array( 'camera' => '' ) );
check( 'shortcode missing camera → ch-error', strpos( $missing, 'ch-error' ) !== false && strpos( $missing, '<iframe' ) === false );

$GLOBALS['ch_options'] = array( Ch_Client::OPT_BASE_URL => '', Ch_Client::OPT_SLUG => '' );
$nocfg = Ch_Shortcode::render( array( 'camera' => 'glacier-bowl' ) );
check( 'shortcode missing config → ch-error', strpos( $nocfg, 'ch-error' ) !== false && strpos( $nocfg, '<iframe' ) === false );

done();
