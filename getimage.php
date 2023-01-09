<?php
namespace WebSocket;
use \PDO;
use \PDOException;

require __DIR__.'/vendor/autoload.php';
date_default_timezone_set("Europe/Dublin"); 

$timestamp = time();
$sql_timestamp = date("Y-m-d H:i:s",$timestamp);
$latitude = "53.350140";
$longitude = "-6.266155";

$sun_info = date_sun_info($timestamp,$latitude,$longitude);

$sunrise = $sun_info['sunrise'];
$sunset = $sun_info['sunset'];

if ($timestamp >= $sunrise && $timestamp <= $sunset){

  $client = new Client("wss://cam.kitesportcentre.com/gl-cam");
  $message = $client->receive();

  try {
    $connection = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);

    $connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $statement = $connection->prepare("INSERT INTO images (timestamp,data) 
        VALUES (?,?)");

    $statement->execute(array($sql_timestamp,$message));

  } catch(PDOException $e) {
    //
  }
$conn = null;
}
else{
    return;
}

$client->close();
?>