<?php
/**
 * Plugin Name: Camera History
 * Description: Embed the Camera History widget with a shortcode.
 * Version: 2.0.0
 * Author: Camera History
 * Text Domain: camera-history
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

defined( 'ABSPATH' ) || exit;

define( 'CH_PLUGIN_FILE', __FILE__ );
define( 'CH_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

require_once CH_PLUGIN_DIR . 'includes/class-client.php';
require_once CH_PLUGIN_DIR . 'includes/class-shortcode.php';
require_once CH_PLUGIN_DIR . 'includes/class-settings.php';

add_action(
	'plugins_loaded',
	static function () {
		// 1.x stored admin credentials. Remove them on upgrade.
		delete_option( 'ch_email' );
		delete_option( 'ch_password' );
		delete_transient( 'ch_tokens' );

		Ch_Shortcode::register();
		Ch_Settings::init();
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
