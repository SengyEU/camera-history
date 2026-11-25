<?php
/**
 * Top-level Camera History admin menu.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Admin {

	const GROUP = 'camera_history_settings';

	/**
	 * @return void
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
	}

	/**
	 * @return void
	 */
	public static function menu() {
		add_menu_page(
			__( 'Camera History', 'camera-history' ),
			__( 'Camera History', 'camera-history' ),
			'manage_options',
			'camera-history',
			array( __CLASS__, 'render' ),
			'dashicons-camera',
			58
		);
	}

	/**
	 * @return void
	 */
	public static function register_settings() {
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
	 * @param mixed $value Raw value.
	 * @return string
	 */
	public static function sanitize_slug( $value ) {
		return sanitize_title( (string) $value );
	}

	/**
	 * @return void
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$tab = isset( $_GET['tab'] ) ? sanitize_key( (string) $_GET['tab'] ) : 'cameras';
		if ( ! in_array( $tab, array( 'cameras', 'groups', 'settings' ), true ) ) {
			$tab = 'cameras';
		}

		$client       = new Ch_Client();
		$cameras      = $client->list_cameras();
		$groups       = $client->list_groups();
		$camera_error = is_wp_error( $cameras ) ? $cameras->get_error_message() : '';
		$group_error  = is_wp_error( $groups ) ? $groups->get_error_message() : '';
		$error        = $camera_error !== '' ? $camera_error : $group_error;
		$slug         = (string) get_option( Ch_Client::OPT_SLUG, '' );

		$tabs = array(
			'cameras'  => __( 'Cameras', 'camera-history' ),
			'groups'   => __( 'Groups', 'camera-history' ),
			'settings' => __( 'Settings', 'camera-history' ),
		);
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Camera History', 'camera-history' ); ?></h1>

			<nav class="nav-tab-wrapper">
				<?php foreach ( $tabs as $key => $label ) : ?>
					<a class="nav-tab <?php echo $tab === $key ? 'nav-tab-active' : ''; ?>"
						href="<?php echo esc_url( admin_url( 'admin.php?page=camera-history&tab=' . $key ) ); ?>">
						<?php echo esc_html( $label ); ?>
					</a>
				<?php endforeach; ?>
			</nav>

			<?php if ( $error !== '' ) : ?>
				<div class="notice notice-error"><p><?php echo esc_html( $error ); ?></p></div>
			<?php elseif ( $slug !== '' ) : ?>
				<p class="description">
					<?php
					printf(
						/* translators: %s: workspace slug */
						esc_html__( 'Connected to workspace %s.', 'camera-history' ),
						'<code>' . esc_html( $slug ) . '</code>'
					);
					?>
				</p>
			<?php endif; ?>

			<?php if ( $tab === 'settings' ) : ?>
				<form method="post" action="options.php">
					<?php settings_fields( self::GROUP ); ?>
					<input type="hidden" name="_wp_http_referer" value="<?php echo esc_attr( admin_url( 'admin.php?page=camera-history&tab=settings' ) ); ?>" />
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><label for="ch_tenant_slug"><?php esc_html_e( 'Workspace slug', 'camera-history' ); ?></label></th>
							<td>
								<input type="text" class="regular-text" id="ch_tenant_slug"
									name="<?php echo esc_attr( Ch_Client::OPT_SLUG ); ?>"
									value="<?php echo esc_attr( $slug ); ?>"
									placeholder="<?php esc_attr_e( 'e.g. alpine-summit', 'camera-history' ); ?>" />
								<p class="description"><?php esc_html_e( 'The plugin connects to Camera History automatically. It never stores an account password.', 'camera-history' ); ?></p>
							</td>
						</tr>
					</table>
					<?php submit_button( __( 'Save settings', 'camera-history' ) ); ?>
				</form>
				<p class="description"><?php echo esc_html( 'Camera History plugin ' . CH_VERSION ); ?></p>
			<?php elseif ( $tab === 'groups' ) : ?>
				<?php self::render_list( 'groups', $groups, $group_error ); ?>
			<?php else : ?>
				<?php self::render_list( 'cameras', $cameras, $camera_error ); ?>
			<?php endif; ?>
		</div>
		<script>
		document.querySelectorAll('.ch-copy').forEach(function (button) {
			button.addEventListener('click', function () {
				if (!navigator.clipboard) return;
				navigator.clipboard.writeText(button.dataset.url || '').then(function () {
					var old = button.textContent;
					button.textContent = '<?php echo esc_js( __( 'Copied', 'camera-history' ) ); ?>';
					setTimeout(function () { button.textContent = old; }, 2000);
				});
			});
		});
		</script>
		<?php
	}

	/**
	 * @param string     $kind cameras|groups.
	 * @param array|WP_Error $items Items.
	 * @param string     $error Error message.
	 * @return void
	 */
	private static function render_list( $kind, $items, $error ) {
		if ( $error !== '' ) {
			return;
		}
		if ( empty( $items ) ) {
			?>
			<p><?php esc_html_e( 'No cameras or groups yet. Add them in Camera History first.', 'camera-history' ); ?></p>
			<?php
			return;
		}
		?>
		<table class="widefat striped">
			<thead>
				<tr>
					<th><?php echo $kind === 'groups' ? esc_html__( 'Group', 'camera-history' ) : esc_html__( 'Camera', 'camera-history' ); ?></th>
					<th><?php esc_html_e( 'Slug', 'camera-history' ); ?></th>
					<?php if ( $kind === 'groups' ) : ?>
						<th><?php esc_html_e( 'Cameras', 'camera-history' ); ?></th>
					<?php endif; ?>
					<th><?php esc_html_e( 'Embed URL', 'camera-history' ); ?></th>
					<th><?php esc_html_e( 'Copy', 'camera-history' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( $items as $item ) : ?>
					<?php $url = Ch_Renderer::url( $kind === 'groups' ? 'group' : 'camera', $item['slug'] ); ?>
					<tr>
						<td><strong><?php echo esc_html( $item['name'] ); ?></strong></td>
						<td><code><?php echo esc_html( $item['slug'] ); ?></code></td>
						<?php if ( $kind === 'groups' ) : ?>
							<td><?php echo esc_html( (string) $item['cameraCount'] ); ?></td>
						<?php endif; ?>
						<td><code><?php echo esc_html( $url ); ?></code></td>
						<td>
							<button type="button" class="button ch-copy" data-url="<?php echo esc_attr( $url ); ?>">
								<?php esc_html_e( 'Copy', 'camera-history' ); ?>
							</button>
						</td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<p class="description"><?php esc_html_e( 'Paste a URL into a post or page to embed it. The block editor also has a Camera History block.', 'camera-history' ); ?></p>
		<?php
	}
}
