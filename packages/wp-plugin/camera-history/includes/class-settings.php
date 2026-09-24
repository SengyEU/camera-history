<?php
/**
 * Správcovská stránka Camera History (Settings → Camera History).
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
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_url' ) )
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_EMAIL,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_email' ) )
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_PASSWORD,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_password' ) )
		);
		register_setting(
			self::GROUP,
			Ch_Client::OPT_SLUG,
			array( 'type' => 'string', 'sanitize_callback' => array( __CLASS__, 'sanitize_slug' ) )
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
	public static function sanitize_email( $value ) {
		return sanitize_email( trim( (string) $value ) );
	}

	/**
	 * Prázdná hodnota = ponechat uložené heslo. Nikdy se nezobrazuje.
	 *
	 * @param mixed $value
	 * @return string
	 */
	public static function sanitize_password( $value ) {
		$value = (string) $value;
		if ( $value === '' ) {
			return (string) get_option( Ch_Client::OPT_PASSWORD, '' );
		}
		return $value;
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

		if ( $error !== '' ) {
			echo '<div class="notice notice-error"><p>' . esc_html( $error ) . '</p></div>';
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Camera History', 'camera-history' ); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="ch_api_base_url"><?php esc_html_e( 'API URL', 'camera-history' ); ?></label></th>
						<td>
							<input type="url" class="regular-text" id="ch_api_base_url"
								name="<?php echo esc_attr( Ch_Client::OPT_BASE_URL ); ?>"
								value="<?php echo esc_attr( get_option( Ch_Client::OPT_BASE_URL, '' ) ); ?>"
								placeholder="https://camera.sengycraft.cz" />
							<p class="description"><?php esc_html_e( 'Musí začínat https://.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_email"><?php esc_html_e( 'E-mail', 'camera-history' ); ?></label></th>
						<td>
							<input type="email" class="regular-text" id="ch_email"
								name="<?php echo esc_attr( Ch_Client::OPT_EMAIL ); ?>"
								value="<?php echo esc_attr( get_option( Ch_Client::OPT_EMAIL, '' ) ); ?>" />
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_password"><?php esc_html_e( 'Heslo', 'camera-history' ); ?></label></th>
						<td>
							<input type="password" class="regular-text" id="ch_password"
								name="<?php echo esc_attr( Ch_Client::OPT_PASSWORD ); ?>" autocomplete="new-password"
								placeholder="<?php echo esc_attr( __( 'zachovat stávající', 'camera-history' ) ); ?>" />
							<p class="description"><?php esc_html_e( 'Heslo se nikdy nezobrazuje; prázdné políčko zachová uložené heslo.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ch_tenant_slug"><?php esc_html_e( 'Tenant slug', 'camera-history' ); ?></label></th>
						<td>
							<input type="text" class="regular-text" id="ch_tenant_slug"
								name="<?php echo esc_attr( Ch_Client::OPT_SLUG ); ?>"
								value="<?php echo esc_attr( get_option( Ch_Client::OPT_SLUG, '' ) ); ?>"
								placeholder="např. acme-basins" />
							<p class="description"><?php esc_html_e( 'Slug tenanta (vidíte ho v admin URL). Použije se v URL widgetu.', 'camera-history' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Výběr kamery', 'camera-history' ); ?></th>
						<td>
							<?php if ( $error !== '' ) : ?>
								<p class="description"><?php esc_html_e( 'Seznam kamer se nepodařilo načíst (viz chyba výše).', 'camera-history' ); ?></p>
							<?php elseif ( empty( $cameras ) ) : ?>
								<p class="description"><?php esc_html_e( 'Žádné kamery. Vytvořte kameru v adminu.', 'camera-history' ); ?></p>
							<?php else : ?>
								<select id="ch-camera-pick">
									<?php foreach ( $cameras as $camera ) : ?>
										<option value="<?php echo esc_attr( $camera['id'] ); ?>">
											<?php echo esc_html( $camera['name'] . ' (' . $camera['feedType'] . ', ' . $camera['status'] . ')' ); ?>
										</option>
									<?php endforeach; ?>
								</select>
								<p class="description">
									<?php esc_html_e( 'Shortcode pro vybranou kameru:', 'camera-history' ); ?>
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