<?php
namespace WebSocket;
use \PDO;
use \PDOException;

require_once 'lib/Client.php';
require 'db.php';

date_default_timezone_set("Europe/Dublin"); 

//Nastaveni mista pro zapad/vychod slunce

$timestamp = time();
$sql_timestamp = date("Y-m-d H:i:s",$timestamp);
$latitude = "53.350140";
$longitude = "-6.266155";

//Zjisteni info o vychodu a zapadu slunce

$sun_info = date_sun_info($timestamp,$latitude,$longitude);

$sunrise = $sun_info['sunrise'];
$sunset = $sun_info['sunset'];

$connection = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);

$connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$getstamp = $connection->prepare("SELECT timestamp FROM images ORDER BY id DESC LIMIT 1");
$getstamp->execute();

while ($getstampResult = $getstamp->fetch(PDO::FETCH_ASSOC)) {

  $seconds = strtotime($timestamp) - strtotime($getstampResult['timestamp']);
  $hours = $seconds / 60 / 60;


//Pokud je den, napoj se na websocket, stáhni tam jeden obrázek a ulož ho do databáze společně s timestamp a id

if ($timestamp >= $sunrise && $timestamp <= $sunset){
  if($hours >= 1){
  $client = new Client("wss://cam.kitesportcentre.com/gl-cam");
  $message = $client->receive();


    $statement = $connection->prepare("INSERT INTO images (timestamp,data) 
        VALUES (?,?)");

    $statement->execute(array($sql_timestamp,$message));

    $conn = null;

    $client->close();
  }
}
else{
    return;
}

}
?>