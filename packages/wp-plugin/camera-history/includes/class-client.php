<?php
/**
 * HTTP client for the public Camera History API.
 *
 * The API host is fixed by the plugin. It only needs a workspace slug and
 * never stores an admin account password or session token.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Client {

	const OPT_SLUG        = 'ch_tenant_slug';
	const DEFAULT_BASE_URL = CH_API_URL;
	const REQUEST_TIMEOUT  = 15;

	/**
	 * @return array|WP_Error List of {id, name, slug}.
	 */
	public function list_cameras() {
		return $this->list_items( 'cameras' );
	}

	/**
	 * @return array|WP_Error List of {id, name, slug, cameraCount}.
	 */
	public function list_groups() {
		return $this->list_items( 'groups' );
	}

	/**
	 * @param string $kind cameras|groups.
	 * @return array|WP_Error
	 */
	private function list_items( $kind ) {
		$base = untrailingslashit( CH_API_URL );
		$slug = (string) get_option( self::OPT_SLUG, '' );

		if ( $slug === '' ) {
			return new WP_Error(
				'ch_missing_config',
				__( 'Camera History: set the workspace slug in Camera History → Settings.', 'camera-history' )
			);
		}

		$response = wp_remote_get(
			$base . '/api/v1/public/tenants/' . rawurlencode( $slug ) . '/' . $kind,
			array( 'timeout' => self::REQUEST_TIMEOUT )
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code !== 200 ) {
			return new WP_Error( 'ch_request_failed', $this->error_message( $response, $code ) );
		}

		$body  = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$items = isset( $body[ $kind ] ) && is_array( $body[ $kind ] ) ? $body[ $kind ] : array();

		return array_values(
			array_filter(
				array_map(
					function ( $item ) use ( $kind ) {
						if ( ! is_array( $item ) || empty( $item['id'] ) || empty( $item['name'] ) || empty( $item['slug'] ) ) {
							return null;
						}
						$out = array(
							'id'   => (string) $item['id'],
							'name' => (string) $item['name'],
							'slug' => (string) $item['slug'],
						);
						if ( $kind === 'groups' ) {
							$out['cameraCount'] = isset( $item['cameraCount'] ) ? (int) $item['cameraCount'] : 0;
						}
						return $out;
					},
					$items
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
