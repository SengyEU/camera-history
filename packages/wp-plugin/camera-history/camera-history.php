<?php
/**
 * Plugin Name: Camera History
 * Description: Embed camera history and group switchers with a block, widget or URL.
 * Version: 3.1.0
 * Author: Camera History
 * Text Domain: camera-history
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

defined( 'ABSPATH' ) || exit;

define( 'CH_VERSION', '3.1.0' );
define( 'CH_API_URL', 'https://camera.sengycraft.cz' );
define( 'CH_PLUGIN_FILE', __FILE__ );
define( 'CH_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'CH_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once CH_PLUGIN_DIR . 'includes/class-client.php';
require_once CH_PLUGIN_DIR . 'includes/class-renderer.php';
require_once CH_PLUGIN_DIR . 'includes/class-block.php';
require_once CH_PLUGIN_DIR . 'includes/class-widget.php';
require_once CH_PLUGIN_DIR . 'includes/class-admin.php';

add_action(
	'plugins_loaded',
	static function () {
		// 1.x stored admin credentials. Remove them on upgrade.
		delete_option( 'ch_email' );
		delete_option( 'ch_password' );
		delete_transient( 'ch_tokens' );

		Ch_Block::init();
		Ch_Widget::init();
		Ch_Admin::init();
	}
);

add_action(
	'init',
	static function () {
		Ch_Renderer::register_embed_handler();
	}
);

// The embed helper must run after the iframe is parsed, so defer it.
add_filter(
	'script_loader_tag',
	static function ( $tag, $handle ) {
		if ( 'camera-history-embed' !== $handle ) {
			return $tag;
		}
		return str_replace( '<script ', '<script defer ', $tag );
	},
	10,
	2
);
