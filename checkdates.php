<?php
require('db.php');

$dt = DateTime::createFromFormat("Y-m-d H:i:s", "2011-07-26 20:05:00");
echo $dt->format('H');
?>