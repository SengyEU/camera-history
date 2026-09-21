<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS, POST");
header("Access-Control-Allow-Headers: *");

require('db.php');


// Prijmuti datumu z headeru

$data = json_decode(file_get_contents("php://input"),true);

//Pripojeni na databazi s datumem

$conenction = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
$query = $conenction->prepare("SELECT * FROM images WHERE DATE(timestamp) = :datum");
$query->execute([':datum' => $data["datum"]]);
$rows = $query->fetchAll();

//Output obrazku jako json

header('Content-Type: application/json; charset=utf-8');
echo json_encode($rows);
?>