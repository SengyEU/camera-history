<?php
namespace WebSocket;
use \PDO;

require __DIR__.'/vendor/autoload.php';
$client = new Client("wss://cam.kitesportcentre.com/gl-cam");
date_default_timezone_set("Europe/Dublin"); 

$message = $client->receive();


$timestamp = time();
$sql_timestamp = date("Y-m-d H:i:s",$timestamp);
$latitude = "53.350140";
$longitude = "-6.266155";

$sun_info = date_sun_info($timestamp,$latitude,$longitude);

$sunrise = $sun_info['sunrise'];
$sunset = $sun_info['sunset'];

if ($timestamp >= $sunrise && $timestamp <= $sunset){
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