<?php
declare(strict_types=1);

/** Minimal WordPress stubs for the local plugin harness. */

define( 'ABSPATH', 'unittest/' );
define( 'CH_API_URL', 'https://camera.sengycraft.cz' );
$GLOBALS['ch_options']   = array();
$GLOBALS['ch_scripts']   = array();
$GLOBALS['ch_http']      = null;
$GLOBALS['ch_last_args'] = array();

function get_option( $key, $default = false ) {
	return array_key_exists( $key, $GLOBALS['ch_options'] ) ? $GLOBALS['ch_options'][ $key ] : $default;
}
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

function wp_enqueue_script( $handle, $src = '', $deps = array(), $ver = null, $in_footer = false ) {
	if ( ! isset( $GLOBALS['ch_scripts'][ $handle ] ) ) {
		$GLOBALS['ch_scripts'][ $handle ] = array( 'src' => $src, 'ver' => $ver, 'footer' => $in_footer );
	}
}
function did_action( $hook ) { return false; }
function esc_url( $url ) { return htmlspecialchars( (string) $url, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $str ) { return htmlspecialchars( (string) $str, ENT_QUOTES, 'UTF-8' ); }
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
				'body' => '{"cameras":[{"id":"cam-1","name":"Main","slug":"main"},{"id":"cam-2","name":"Park","slug":"park","extra":"ignored"}]}',
			);
		}
		if ( $method === 'GET' && $path === '/api/v1/public/tenants/acme-basins/groups' ) {
			return array(
				'code' => 200,
				'body' => '{"groups":[{"id":"grp-1","name":"Summit","slug":"summit","cameraCount":2,"extra":"ignored"}]}',
			);
		}
		if ( $path === '/api/v1/public/tenants/missing/cameras' || $path === '/api/v1/public/tenants/missing/groups' ) {
			return array( 'code' => 404, 'body' => '{"detail":"Workspace not found"}' );
		}
		return array( 'code' => 404, 'body' => '{"detail":"no route"}' );
	};
}

require dirname( __DIR__ ) . '/camera-history/includes/class-client.php';
require dirname( __DIR__ ) . '/camera-history/includes/class-renderer.php';

install_fake_api();

// ---- client: cameras and groups ----
$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_SLUG => 'acme-basins',
);
$cameras = ( new Ch_Client() )->list_cameras();
check( 'list_cameras returns an array', is_array( $cameras ) && count( $cameras ) === 2 );
check( 'list_cameras keeps id, name and slug', isset( $cameras[0]['id'], $cameras[0]['name'], $cameras[0]['slug'] ) );
check( 'list_cameras ignores extra fields', ! isset( $cameras[1]['extra'] ) );
check( 'list_cameras does not send a cookie', ! isset( $GLOBALS['ch_last_args']['headers']['Cookie'] ) );

$groups = ( new Ch_Client() )->list_groups();
check( 'list_groups returns a group', is_array( $groups ) && count( $groups ) === 1 );
check( 'list_groups keeps cameraCount', $groups[0]['cameraCount'] === 2 );

$GLOBALS['ch_options'] = array( Ch_Client::OPT_SLUG => '' );
$err = ( new Ch_Client() )->list_cameras();
check( 'missing config returns WP_Error', is_wp_error( $err ) && $err->get_error_message() !== '' );

$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_SLUG => 'missing',
);
$err = ( new Ch_Client() )->list_groups();
check( 'unknown workspace returns WP_Error', is_wp_error( $err ) && $err->get_error_message() === 'Workspace not found' );

// ---- renderer ----
$GLOBALS['ch_options'] = array(
	Ch_Client::OPT_SLUG => 'acme-basins',
);
check( 'camera URL uses widget path', Ch_Renderer::url( 'camera', 'glacier-bowl' ) === 'https://camera.sengycraft.cz/widget/acme-basins/glacier-bowl' );
check( 'group URL uses group path', Ch_Renderer::url( 'group', 'summit' ) === 'https://camera.sengycraft.cz/group/acme-basins/summit' );

$GLOBALS['ch_scripts'] = array();
$html = Ch_Renderer::iframe( 'camera', 'glacier-bowl' );
check( 'iframe builds camera source', strpos( $html, 'src="https://camera.sengycraft.cz/widget/acme-basins/glacier-bowl"' ) !== false );
check( 'iframe defaults width/height', strpos( $html, 'width="100%"' ) !== false && strpos( $html, 'height="720"' ) !== false );
check( 'iframe includes attrs', strpos( $html, 'allowfullscreen' ) !== false && strpos( $html, 'loading="lazy"' ) !== false );
check( 'embed helper enqueued', isset( $GLOBALS['ch_scripts']['camera-history-embed'] ) );
check( 'embed helper follows API base', ( $GLOBALS['ch_scripts']['camera-history-embed']['src'] ?? '' ) === 'https://camera.sengycraft.cz/embed.js' );

$group_html = Ch_Renderer::iframe( 'group', 'summit', '80%', '600', 'dark' );
check( 'group iframe uses group path and theme', strpos( $group_html, '/group/acme-basins/summit?theme=dark' ) !== false );
check( 'group iframe honors dimensions', strpos( $group_html, 'width="80%"' ) !== false && strpos( $group_html, 'height="600"' ) !== false );

$old_id = Ch_Renderer::iframe( 'camera', 'c28e31f9-96e5-4563-b137-32bc894abea1' );
check( 'old camera ID still renders', strpos( $old_id, '/widget/acme-basins/c28e31f9-96e5-4563-b137-32bc894abea1' ) !== false );

$GLOBALS['ch_options'] = array( Ch_Client::OPT_SLUG => '' );
$nocfg = Ch_Renderer::iframe( 'camera', 'glacier-bowl' );
check( 'missing config returns ch-error', strpos( $nocfg, 'ch-error' ) !== false && strpos( $nocfg, '<iframe' ) === false );

done();
