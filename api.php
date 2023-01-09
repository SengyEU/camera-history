<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS, POST");
header("Access-Control-Allow-Headers: *");


$data = json_decode(file_get_contents("php://input"),true);

$conenction = new PDO('mysql:host=mysql.hostnow.cz;dbname='. $DB, $DB, $DBS);
$query = $conenction->prepare("SELECT * FROM images WHERE DATE(timestamp) = :datum");
$query->execute([':datum' => $data["datum"]]);
$rows = $query->fetchAll();

header('Content-Type: application/json; charset=utf-8');
echo json_encode($rows);
?>