=== Camera History ===
Contributors: camera-history
Tags: camera, video, widget
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 3.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed camera history and group switchers with a block, widget or URL.

== Description ==

Camera History turns hourly camera snapshots into a browsable visual history.
This plugin gives you three ways to embed it:

* **Camera History block** in the block editor.
* **Camera History widget** in classic sidebars.
* **Paste a Camera History URL** into a post or page.

The plugin only needs your workspace slug. It does not store an admin email
address, password or session token.

Features:

* Camera and group selection.
* Optional width, height and theme.
* Server-rendered iframe with automatic height.
* Connection settings in a top-level Camera History menu.
* No Composer dependencies and no account credentials stored in WordPress.

== Installation ==

1. In WordPress, go to **Plugins → Add New → Upload Plugin**.
2. Upload `camera-history.zip`, click **Install Now**, then **Activate**.
3. Open **Camera History → Settings** and enter the workspace slug.
4. Add the **Camera History** block to a page, or use the widget/paste a URL.

You can find the workspace slug in Camera History under **Plugins**.

== Frequently Asked Questions ==

= Where do I find the workspace slug? =
Open Camera History → Plugins. The workspace slug is shown with a copy button.

= Does the plugin store my Camera History password? =
No. It only reads the public camera and group lists for your workspace.

= Does this plugin require a Camera History account? =
Yes. Camera History is an external service that stores and serves the camera
history. The plugin is an interface to that service.

== Changelog ==

= 3.1.0 =
* The API host is built into the plugin; only the workspace slug is configured.

= 3.0.0 =
* Added a Gutenberg block with camera/group selection and preview.
* Added a classic widget.
* Added pasted-URL embeds.
* Added group support.
* Moved settings to a top-level Camera History menu with Cameras, Groups and Settings tabs.
* Removed the shortcode.

= 2.0.0 =
* Removed admin email/password and session handling.
* Camera list now comes from the public workspace endpoint.
* Settings translated to English.

= 1.0.0 =
* First release.
