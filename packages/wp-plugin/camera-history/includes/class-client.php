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