<?php
/**
 * Settings page: Settings → Camera History.
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
			array(
				'type'              => 'string',
				'default'           => Ch_Client::DEFAULT_BASE_URL,
				'sanitize_callback' => array( __CLASS__, 'sanitize_url' ),
			)
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_SLUG,
			array(
				'type'              => 'string',
				'default'           => '',
				'sanitize_callback' => array( __CLASS__, 'sanitize_slug' ),
			)
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
		$base    = (string) get_option( Ch_Client::OPT_BASE_URL, Ch_Client::DEFAULT_BASE_URL );
		$slug    = (string) get_option( Ch_Client::OPT_SLUG, '' );

		if ( $error !== '' ) {
			echo '<div class="notice notice-error"><p>' . esc_html( $error ) . '</p></div>';
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Camera History', 'camera-history' ); ?></h1>
			<p><?php esc_html_e( 'Embed your camera history on this site. The plugin only needs the API URL and workspace slug; it does not store an account password.', 'camera-history' ); ?></p>
			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="ch_api_base_url"><?php esc_html_e( 'API URL', 'camera-history' ); ?></label></th>
						<td>
							<input type="url" class="regular-text" id="ch_api_base_url"
								name="<?php echo esc_attr( Ch_Client::OPT_BASE_URL ); ?>"
								value="<?php echo esc_attr( $base ); ?>"
								placeholder="<?php echo esc_attr( Ch_Client::DEFAULT_BASE_URL ); ?>" />
							<p class="description"><?php esc_html_e( 'Must start with https://.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_tenant_slug"><?php esc_html_e( 'Workspace slug', 'camera-history' ); ?></label></th>
						<td>
							<input type="text" class="regular-text" id="ch_tenant_slug"
								name="<?php echo esc_attr( Ch_Client::OPT_SLUG ); ?>"
								value="<?php echo esc_attr( $slug ); ?>"
								placeholder="<?php esc_attr_e( 'e.g. alpine-summit', 'camera-history' ); ?>" />
							<p class="description"><?php esc_html_e( 'Find it in Camera History under Plugins, or in your widget URL.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Camera', 'camera-history' ); ?></th>
						<td>
							<?php if ( $error !== '' ) : ?>
								<p class="description"><?php esc_html_e( 'The camera list could not be loaded. Fix the error above and save again.', 'camera-history' ); ?></p>
							<?php elseif ( empty( $cameras ) ) : ?>
								<p class="description"><?php esc_html_e( 'No cameras yet. Add a camera in Camera History first.', 'camera-history' ); ?></p>
							<?php else : ?>
								<select id="ch-camera-pick">
									<?php foreach ( $cameras as $camera ) : ?>
										<option value="<?php echo esc_attr( $camera['slug'] ); ?>">
											<?php echo esc_html( $camera['name'] . ' (' . $camera['slug'] . ')' ); ?>
										</option>
									<?php endforeach; ?>
								</select>
								<p class="description">
									<?php esc_html_e( 'Shortcode for the selected camera:', 'camera-history' ); ?>
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
