<?php
namespace WebSocket;
use \PDO;

require __DIR__.'/vendor/autoload.php';
$client = new Client("wss://cam.kitesportcentre.com/gl-cam");

$message = $client->receive();

try {
    $conn = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $sql = "INSERT INTO images (timestamp,data)
    VALUES (CURRENT_TIMESTAMP, '$message')";
    $conn->exec($sql);
    //
  } catch(PDOException $e) {
    //
  }
$conn = null;


$client->close();
?>