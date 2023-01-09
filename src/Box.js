import React, { useEffect, useState } from "react";
import axios from "axios";

function Box(){

  function subtractDays(date, days){
    date.setDate(date.getDate() - days);

    return date;
  }

  const todayDate = new Date().toISOString().slice(0, 10);

  var minDate = subtractDays(new Date(), 50).toISOString().slice(0, 10);

  const [date,setDate] = useState(todayDate);

  const [images,setImages] = useState([]);

  useEffect(() => {

    const noImage = [{"id":"1","timestamp":"","data":"https://www.kitesportcentre.com/wp-content/uploads/camera_off.png"}];

    axios.post('https://api.openhosting.tk',({
      headers: {'Content-Type': 'application/json'},
      datum: date
    })).then(function (response) {

      if (response.data.length === 0) {
        setImages(noImage)
      }
      else{
        setImages(response.data)
      }
    })
    .catch(function (error) {
      console.log(error);
    })

  },[date]);

  const [IsOpen, setIsOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null);

  const toggleIsOpen = () => {
    setIsOpen(current => !current);
  };

  
return (
  <>
    <div className="wrapper">
    <div className="container">
    {images.map((image, index) => (
        <div key={image.id} className={`box ${openItem === image.id && IsOpen  ? 'active' : ''}`} onClick={() => {setOpenItem(image.id);toggleIsOpen();}} style={{backgroundImage:`url(${image.data})`,'--bgpos': (index * (-800 / images.length)) + "px 0%"}}>{image.timestamp.slice(11,16)}</div>
    ))}
    </div>
    <input className="calendar" type="date" onChange={(e)=>{setDate(e.target.value)}} defaultValue={todayDate} min={minDate} max={todayDate} />
    </div>
  </>
);
}

export default Box;