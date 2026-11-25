<?php
/**
 * Classic WordPress widget.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Widget extends WP_Widget {

	/**
	 * @return void
	 */
	public static function init() {
		add_action(
			'widgets_init',
			static function () {
				register_widget( __CLASS__ );
			}
		);
	}

	public function __construct() {
		parent::__construct(
			'camera_history_widget',
			__( 'Camera History', 'camera-history' ),
			array( 'description' => __( 'Embed a camera history or a group switcher.', 'camera-history' ) )
		);
	}

	/**
	 * @param array $args Sidebar arguments.
	 * @param array $instance Widget instance.
	 * @return void
	 */
	public function widget( $args, $instance ) {
		$type   = isset( $instance['type'] ) ? (string) $instance['type'] : 'camera';
		$slug   = isset( $instance['slug'] ) ? (string) $instance['slug'] : '';
		$width  = isset( $instance['width'] ) ? (string) $instance['width'] : '100%';
		$height = isset( $instance['height'] ) ? (string) $instance['height'] : '720';
		$theme  = isset( $instance['theme'] ) ? (string) $instance['theme'] : '';

		if ( $slug === '' ) {
			return;
		}

		echo $args['before_widget'];
		if ( ! empty( $instance['title'] ) ) {
			echo $args['before_title'] . esc_html( $instance['title'] ) . $args['after_title'];
		}
		echo Ch_Renderer::iframe( $type, $slug, $width, $height, $theme );
		echo $args['after_widget'];
	}

	/**
	 * @param array $instance Widget instance.
	 * @return void
	 */
	public function form( $instance ) {
		$type   = isset( $instance['type'] ) ? (string) $instance['type'] : 'camera';
		$slug   = isset( $instance['slug'] ) ? (string) $instance['slug'] : '';
		$width  = isset( $instance['width'] ) ? (string) $instance['width'] : '100%';
		$height = isset( $instance['height'] ) ? (string) $instance['height'] : '720';
		$theme  = isset( $instance['theme'] ) ? (string) $instance['theme'] : '';
		$title  = isset( $instance['title'] ) ? (string) $instance['title'] : '';

		$client  = new Ch_Client();
		$cameras = $client->list_cameras();
		$groups  = $client->list_groups();
		$error   = is_wp_error( $cameras ) ? $cameras->get_error_message() : '';
		$selected = $slug !== '' ? $type . ':' . $slug : '';
		?>
		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>"><?php esc_html_e( 'Title', 'camera-history' ); ?></label>
			<input class="widefat" type="text"
				id="<?php echo esc_attr( $this->get_field_id( 'title' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'title' ) ); ?>"
				value="<?php echo esc_attr( $title ); ?>" />
		</p>
		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'target' ) ); ?>"><?php esc_html_e( 'Camera or group', 'camera-history' ); ?></label>
			<select class="widefat"
				id="<?php echo esc_attr( $this->get_field_id( 'target' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'target' ) ); ?>">
				<option value=""><?php esc_html_e( 'Select…', 'camera-history' ); ?></option>
				<?php if ( ! is_wp_error( $cameras ) && ! empty( $cameras ) ) : ?>
					<optgroup label="<?php esc_attr_e( 'Cameras', 'camera-history' ); ?>">
						<?php foreach ( $cameras as $camera ) : ?>
							<option value="<?php echo esc_attr( 'camera:' . $camera['slug'] ); ?>" <?php selected( $selected, 'camera:' . $camera['slug'] ); ?>>
								<?php echo esc_html( $camera['name'] . ' (' . $camera['slug'] . ')' ); ?>
							</option>
						<?php endforeach; ?>
					</optgroup>
				<?php endif; ?>
				<?php if ( ! is_wp_error( $groups ) && ! empty( $groups ) ) : ?>
					<optgroup label="<?php esc_attr_e( 'Groups', 'camera-history' ); ?>">
						<?php foreach ( $groups as $group ) : ?>
							<option value="<?php echo esc_attr( 'group:' . $group['slug'] ); ?>" <?php selected( $selected, 'group:' . $group['slug'] ); ?>>
								<?php echo esc_html( $group['name'] . ' (' . $group['cameraCount'] . ')' ); ?>
							</option>
						<?php endforeach; ?>
					</optgroup>
				<?php endif; ?>
			</select>
			<?php if ( $error !== '' ) : ?>
				<span class="description"><?php echo esc_html( $error ); ?></span>
			<?php endif; ?>
		</p>
		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'width' ) ); ?>"><?php esc_html_e( 'Width', 'camera-history' ); ?></label>
			<input class="small-text" type="text"
				id="<?php echo esc_attr( $this->get_field_id( 'width' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'width' ) ); ?>"
				value="<?php echo esc_attr( $width ); ?>" />
			<label for="<?php echo esc_attr( $this->get_field_id( 'height' ) ); ?>"><?php esc_html_e( 'Height fallback', 'camera-history' ); ?></label>
			<input class="small-text" type="text"
				id="<?php echo esc_attr( $this->get_field_id( 'height' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'height' ) ); ?>"
				value="<?php echo esc_attr( $height ); ?>" />
		</p>
		<p>
			<label for="<?php echo esc_attr( $this->get_field_id( 'theme' ) ); ?>"><?php esc_html_e( 'Theme', 'camera-history' ); ?></label>
			<select class="widefat"
				id="<?php echo esc_attr( $this->get_field_id( 'theme' ) ); ?>"
				name="<?php echo esc_attr( $this->get_field_name( 'theme' ) ); ?>">
				<option value="" <?php selected( $theme, '' ); ?>><?php esc_html_e( 'Camera default', 'camera-history' ); ?></option>
				<?php foreach ( array( 'light', 'dark', 'forest', 'midnight' ) as $preset ) : ?>
					<option value="<?php echo esc_attr( $preset ); ?>" <?php selected( $theme, $preset ); ?>>
						<?php echo esc_html( ucfirst( $preset ) ); ?>
					</option>
				<?php endforeach; ?>
			</select>
		</p>
		<?php
	}

	/**
	 * @param array $new_instance New values.
	 * @param array $old_instance Old values.
	 * @return array
	 */
	public function update( $new_instance, $old_instance ) {
		$target = isset( $new_instance['target'] ) ? (string) $new_instance['target'] : '';
		$type   = 'camera';
		$slug   = '';
		if ( strpos( $target, 'group:' ) === 0 ) {
			$type = 'group';
			$slug = sanitize_title( substr( $target, 6 ) );
		} elseif ( strpos( $target, 'camera:' ) === 0 ) {
			$slug = sanitize_title( substr( $target, 7 ) );
		}

		return array(
			'title'  => isset( $new_instance['title'] ) ? sanitize_text_field( $new_instance['title'] ) : '',
			'type'   => $type,
			'slug'   => $slug,
			'width'  => isset( $new_instance['width'] ) ? sanitize_text_field( $new_instance['width'] ) : '100%',
			'height' => isset( $new_instance['height'] ) ? sanitize_text_field( $new_instance['height'] ) : '720',
			'theme'  => isset( $new_instance['theme'] ) ? sanitize_key( $new_instance['theme'] ) : '',
		);
	}
}
