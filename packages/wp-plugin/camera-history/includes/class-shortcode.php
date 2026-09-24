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

		return sprintf(
			'<iframe src="%s" width="%s" height="%s" style="border:0" allowfullscreen loading="lazy"></iframe>',
			esc_url( $url ),
			esc_attr( $options['width'] ),
			esc_attr( $options['height'] )
		);
	}
}