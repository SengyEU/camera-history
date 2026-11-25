=== Camera History ===
Contributors: camera-history
Tags: camera, video, widget
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed the Camera History widget with a shortcode.

== Description ==

Camera History turns hourly camera snapshots into a browsable visual history.
This plugin embeds the widget in any WordPress post or page:

`[camera-history camera="glacier-bowl"]`

The plugin only needs your Camera History API URL and workspace slug. It does
not store an admin email address, password or session token.

The helper script automatically adjusts the iframe height and inherits the
font used by your theme. It is loaded once even when a page contains several
shortcodes.

Features:

* No Composer dependencies.
* No account credentials stored in WordPress.
* Optional shortcode attributes: `width` (default 100%), `height` (fallback
  720), `theme`.
* Camera IDs from the 1.x plugin remain supported.

== Installation ==

1. In WordPress, go to **Plugins → Add New → Upload Plugin**.
2. Upload `camera-history.zip`, click **Install Now**, then **Activate**.
3. Go to **Settings → Camera History** and enter the API URL and workspace slug.
4. Pick a camera and paste the generated shortcode into a post or page.

You can find the API URL and workspace slug in Camera History under **Plugins**.

== Frequently Asked Questions ==

= Where do I find the workspace slug? =
Open Camera History → Plugins. The workspace slug is shown with a copy button.

= What is the camera slug? =
The shortcode uses the camera slug, but older shortcodes that contain a camera
ID still work.

= Does the plugin store my Camera History password? =
No. Version 2.0.0 and later use the public camera list endpoint and never store
account credentials.

= Does this plugin require a Camera History account? =
Yes. Camera History is an external service that stores and serves the camera
history. The plugin is an interface to that service.

== Changelog ==

= 2.0.0 =
* Removed admin email/password and session handling.
* Camera list now comes from the public workspace endpoint.
* Shortcodes use camera slugs; camera IDs remain supported.
* Settings and readme translated to English.
* Legacy credentials are removed on upgrade.

= 1.1.0 =
* Automatically loads `embed.js` once for all shortcodes.
* Default shortcode height is 720 as a fallback.
* Injects the helper after the footer when needed.

= 1.0.0 =
* First release: settings, camera picker and shortcode.
