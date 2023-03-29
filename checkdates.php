<?php
require('db.php');

$connection = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);

$connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$statement = $connection->prepare("SELECT timestamp from images");
$statement->execute();

$rows = $statement->fetchAll();

foreach ($rows as $row) {

    $date1 = DateTime::createFromFormat("Y-m-d H:i:s", $row[0]);

    $date2 = new DateTime(); // current date and time
    $diff = $date2->diff($date1);

    $days = $diff->days;
    echo "" . $date1->format('Y-m-d H:i:s'). " bylo před " . $days . " dny.<br>";

}
?>