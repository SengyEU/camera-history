<?php
/**
 * Uninstall: vyčistí options a transient.
 *
 * @package CameraHistory
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'ch_api_base_url' );
delete_option( 'ch_email' );
delete_option( 'ch_password' );
delete_option( 'ch_tenant_slug' );
delete_transient( 'ch_tokens' );