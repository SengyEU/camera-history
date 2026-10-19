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
				'height' => '720',
				'theme'  => '',
			),
			$atts,
			'camera-history'
		);

		$base   = untrailingslashit( (string) get_option( Ch_Client::OPT_BASE_URL, '' ) );
		$slug   = (string) get_option( Ch_Client::OPT_SLUG, '' );
		$camera = trim( (string) $options['camera'] );

		if ( $base === '' || $slug === '' || $camera === '' ) {
			return '<p class="ch-error">' . esc_html__( 'Camera History: plugin není nakonfigurovaný (API URL, tenant slug) nebo chybí ID kamery.', 'camera-history' ) . '</p>';
		}

		$url = $base . '/widget/' . rawurlencode( $slug ) . '/' . rawurlencode( $camera );
		if ( (string) $options['theme'] !== '' ) {
			$url .= '?theme=' . rawurlencode( (string) $options['theme'] );
		}

		// One helper script per page is enough, even with several shortcodes.
		wp_enqueue_script( 'camera-history-embed', CH_EMBED_URL, array(), null, true );

		$iframe = sprintf(
			'<iframe src="%s" width="%s" height="%s" style="border:0" allowfullscreen loading="lazy"></iframe>',
			esc_url( $url ),
			esc_attr( $options['width'] ),
			esc_attr( $options['height'] )
		);

		// If the shortcode renders after wp_footer (widgets, builders), enqueue
		// alone is too late; print the helper next to the iframe instead.
		if ( function_exists( 'did_action' ) && did_action( 'wp_footer' ) ) {
			$iframe .= '<script src="' . esc_url( CH_EMBED_URL ) . '" defer></script>';
		}

		return $iframe;
	}
}