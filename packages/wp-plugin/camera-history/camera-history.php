<?php
/**
 * Plugin Name: Camera History
 * Description: Vkládá widget Camera History SaaS (iframe) přes shortcode [camera-history camera="…"].
 * Version: 1.0.0
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
		Ch_Shortcode::register();
		Ch_Settings::init();
	}
);