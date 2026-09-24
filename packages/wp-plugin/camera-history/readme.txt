=== Camera History ===
Contributors: camera-history
Tags: video, camera, widget
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Vkládá widget Camera History SaaS (historii snímků kamer) do příspěvků a stránek jako responzivní iframe.

== Description ==

Camera History je plugin pro WordPress, který vloží widget Camera History
SaaS do jakékoliv stránky nebo příspěvku pomocí shortcodu:

`[camera-history camera="ID_KAMERY"]`

Nastavení najdete v **Settings → Camera History**: vyplníte API URL,
e-mail a heslo do SaaS admin účtu a tenant slug. Plugin se připojí k admin
API, načte seznam kamer a zobrazí je v rozbalovacím seznamu — vyberte
kameru a zkopírujte vygenerovaný shortcode.

Vlastnosti:

* Žádné Composer závislosti, žádné secrets v logách.
* Heslo se nikdy nezobrazuje (prázdné políčko = zachovat uložené).
* Volitelné atributy shortcodu: `width` (default 100%), `height` (default 600), `theme`.

== Installation ==

1. V administraci jděte na **Plugins → Add New → Upload Plugin**.
2. Nahrajte `camera-history.zip` a klikněte na **Install Now**.
3. Aktivujte plugin.
4. Jděte na **Settings → Camera History** a vyplňte API URL, e-mail,
   heslo a tenant slug.
5. Vložte `[camera-history camera="…"]` do stránky nebo příspěvku.

== Frequently Asked Questions ==

= Kde najdu ID kamery? =
Na stránce **Settings → Camera History** vyberte kameru v seznamu —
shortcode se vygeneruje v poli vedle seznamu.

= Co je tenant slug? =
Slug tenanta je součást URL widgetu (`/widget/{tenant_slug}/{camera_id}`).
Najdete ho v admin adrese nebo v nastavení tenanta v SaaS.

== Changelog ==

= 1.0.0 =
* První vydání: admin settings, login přes admin API, dropdown kamer, shortcode.