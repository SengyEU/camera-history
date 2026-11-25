<?php
/**
 * Shared iframe renderer for blocks, widgets and pasted URLs.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Renderer {

	/**
	 * @param string $type camera|group.
	 * @param string $target Camera slug/ID or group slug.
	 * @return string Empty when not configured.
	 */
	public static function url( $type, $target ) {
		$base   = untrailingslashit( CH_API_URL );
		$tenant = (string) get_option( Ch_Client::OPT_SLUG, '' );
		$target = trim( (string) $target );

		if ( $base === '' || $tenant === '' || $target === '' ) {
			return '';
		}

		$path = $type === 'group' ? '/group/' : '/widget/';
		return $base . $path . rawurlencode( $tenant ) . '/' . rawurlencode( $target );
	}

	/**
	 * @param string $type camera|group.
	 * @param string $target Camera slug/ID or group slug.
	 * @param string $width Width attribute.
	 * @param string $height Fallback height attribute.
	 * @param string $theme Optional theme.
	 * @return string
	 */
	public static function iframe( $type, $target, $width = '100%', $height = '720', $theme = '' ) {
		$url = self::url( $type, $target );
		if ( $url === '' ) {
			return '<p class="ch-error">' . esc_html__( 'Camera History is not configured, or no camera or group is selected.', 'camera-history' ) . '</p>';
		}
		if ( (string) $theme !== '' ) {
			$url .= '?theme=' . rawurlencode( (string) $theme );
		}

		$base      = untrailingslashit( CH_API_URL );
		$embed_url = $base . '/embed.js';

		wp_enqueue_script( 'camera-history-embed', $embed_url, array(), null, true );

		$iframe = sprintf(
			'<iframe src="%s" width="%s" height="%s" style="border:0" allowfullscreen loading="lazy"></iframe>',
			esc_url( $url ),
			esc_attr( $width ),
			esc_attr( $height )
		);

		if ( function_exists( 'did_action' ) && did_action( 'wp_footer' ) ) {
			$iframe .= '<script src="' . esc_url( $embed_url ) . '" defer></script>';
		}

		return $iframe;
	}

	/**
	 * Register the handler for pasted Camera History URLs.
	 *
	 * @return void
	 */
	public static function register_embed_handler() {
		wp_embed_register_handler(
			'camera-history',
			'~https?://[^\s/]+/(?:widget|group)/([^/\s?#]+)/([^/\s?#]+)~i',
			array( __CLASS__, 'embed_handler' )
		);
	}

	/**
	 * @param array  $matches URL matches.
	 * @param array  $attr Embed attributes.
	 * @param string $url Original URL.
	 * @param array  $rawattr Raw attributes.
	 * @return string
	 */
	public static function embed_handler( $matches, $attr, $url, $rawattr ) {
		$tenant = sanitize_title( $matches[1] );
		$target = sanitize_title( $matches[2] );
		$config = (string) get_option( Ch_Client::OPT_SLUG, '' );

		if ( $config === '' || $tenant !== $config ) {
			return $url;
		}

		$type   = strpos( $url, '/group/' ) !== false ? 'group' : 'camera';
		$width  = isset( $rawattr['width'] ) ? $rawattr['width'] : '100%';
		$height = isset( $rawattr['height'] ) ? $rawattr['height'] : '720';
		$theme  = '';

		$query = parse_url( $url, PHP_URL_QUERY );
		if ( is_string( $query ) && $query !== '' ) {
			parse_str( $query, $args );
			if ( isset( $args['theme'] ) && is_string( $args['theme'] ) ) {
				$theme = sanitize_key( $args['theme'] );
			}
		}

		return self::iframe( $type, $target, $width, $height, $theme );
	}
}
