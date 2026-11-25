<?php
/**
 * Gutenberg block and editor data.
 *
 * @package CameraHistory
 */

defined( 'ABSPATH' ) || exit;

class Ch_Block {

	const NAME = 'camera-history/widget';

	/**
	 * @return void
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
		add_action( 'enqueue_block_editor_assets', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * @return void
	 */
	public static function register() {
		register_block_type(
			self::NAME,
			array(
				'api_version'     => 2,
				'attributes'      => array(
					'type'   => array(
						'type'    => 'string',
						'default' => 'camera',
					),
					'slug'   => array(
						'type'    => 'string',
						'default' => '',
					),
					'width'  => array(
						'type'    => 'string',
						'default' => '100%',
					),
					'height' => array(
						'type'    => 'string',
						'default' => '720',
					),
					'theme'  => array(
						'type'    => 'string',
						'default' => '',
					),
				),
				'render_callback' => array( __CLASS__, 'render' ),
			)
		);
	}

	/**
	 * @param array $attributes Block attributes.
	 * @return string
	 */
	public static function render( $attributes ) {
		return Ch_Renderer::iframe(
			isset( $attributes['type'] ) ? (string) $attributes['type'] : 'camera',
			isset( $attributes['slug'] ) ? (string) $attributes['slug'] : '',
			isset( $attributes['width'] ) ? (string) $attributes['width'] : '100%',
			isset( $attributes['height'] ) ? (string) $attributes['height'] : '720',
			isset( $attributes['theme'] ) ? (string) $attributes['theme'] : ''
		);
	}

	/**
	 * @return void
	 */
	public static function enqueue() {
		wp_enqueue_script(
			'camera-history-block',
			CH_PLUGIN_URL . 'assets/block.js',
			array(
				'wp-blocks',
				'wp-element',
				'wp-block-editor',
				'wp-components',
				'wp-server-side-render',
				'wp-i18n',
			),
			'3.0.0',
			true
		);
		wp_enqueue_style(
			'camera-history-block',
			CH_PLUGIN_URL . 'assets/block.css',
			array(),
			'3.0.0'
		);

		$client  = new Ch_Client();
		$cameras = $client->list_cameras();
		$groups  = $client->list_groups();
		$error   = is_wp_error( $cameras ) ? $cameras->get_error_message() : '';

		wp_localize_script(
			'camera-history-block',
			'chBlockData',
			array(
				'cameras' => is_wp_error( $cameras ) ? array() : $cameras,
				'groups'  => is_wp_error( $groups ) ? array() : $groups,
				'error'   => $error,
			)
		);
	}
}
