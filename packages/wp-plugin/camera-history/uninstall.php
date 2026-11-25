<?php
/**
 * Uninstall: remove options and legacy credentials.
 *
 * @package CameraHistory
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'ch_api_base_url' );
delete_option( 'ch_tenant_slug' );

// Removed in 2.0.0/3.0.0; keep cleanup for upgrades from 1.x.
delete_option( 'ch_email' );
delete_option( 'ch_password' );
delete_transient( 'ch_tokens' );
delete_transient( 'ch_cameras' );
delete_transient( 'ch_groups' );
