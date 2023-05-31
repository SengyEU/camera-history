<?php
require_once("db.php");

$date = $_GET["date"];
$hour = $_GET["hour"];

$connection = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
$connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$statement = $connection->prepare("SELECT data FROM images WHERE HOUR(timestamp) = ? AND DATE(timestamp) = ?");
$statement->execute([$hour, $date]);
$result = $statement->fetchAll();

foreach ($result as $row) {
    $imageData = $row['data']; // Assuming the image data is stored in the 'data' column

    // Extract the base64-encoded portion of the image data
    $base64Data = substr($imageData, strpos($imageData, ",") + 1);

    // Decode the base64-encoded image data
    $decodedImageData = base64_decode($base64Data);

    // Send the right headers
    header("Content-Type: image/jpeg"); // Set the correct content type for JPEG format
    header("Content-Length: " . strlen($decodedImageData)); // Set the correct content length

    // Output the image data and stop the script
    echo $decodedImageData;
    exit;
}
?>
