<?php
/**
 * HTTP client for the public Camera History API.
 *
 * The plugin only needs an API URL and a workspace slug. It never stores
 * an admin account password or session token.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Client {

	const OPT_BASE_URL    = 'ch_api_base_url';
	const OPT_SLUG        = 'ch_tenant_slug';
	const DEFAULT_BASE_URL = 'https://camera.sengycraft.cz';
	const REQUEST_TIMEOUT  = 15;

	/**
	 * GET /api/v1/public/tenants/{slug}/cameras.
	 *
	 * @return array|WP_Error List of {id, name, slug}.
	 */
	public function list_cameras() {
		$base = untrailingslashit( (string) get_option( self::OPT_BASE_URL, self::DEFAULT_BASE_URL ) );
		$slug = (string) get_option( self::OPT_SLUG, '' );

		if ( $base === '' || $slug === '' ) {
			return new WP_Error(
				'ch_missing_config',
				__( 'Camera History: set the API URL and workspace slug in Settings → Camera History.', 'camera-history' )
			);
		}

		$response = wp_remote_get(
			$base . '/api/v1/public/tenants/' . rawurlencode( $slug ) . '/cameras',
			array( 'timeout' => self::REQUEST_TIMEOUT )
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			return new WP_Error( 'ch_cameras_failed', $this->error_message( $response, $code ) );
		}

		$body    = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$cameras = isset( $body['cameras'] ) && is_array( $body['cameras'] ) ? $body['cameras'] : array();

		return array_values(
			array_filter(
				array_map(
					function ( $camera ) {
						if (
							! is_array( $camera ) ||
							empty( $camera['id'] ) ||
							empty( $camera['name'] ) ||
							empty( $camera['slug'] )
						) {
							return null;
						}
						return array(
							'id'   => (string) $camera['id'],
							'name' => (string) $camera['name'],
							'slug' => (string) $camera['slug'],
						);
					},
					$cameras
				)
			)
		);
	}

	/** @internal */
	private function error_message( $response, $code ) {
		$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if (
			is_array( $body ) &&
			isset( $body['detail'] ) &&
			is_string( $body['detail'] ) &&
			$body['detail'] !== ''
		) {
			return $body['detail'];
		}
		return sprintf( __( 'Request failed: %d', 'camera-history' ), $code );
	}
}
