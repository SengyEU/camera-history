import React, { useEffect, useState } from "react";
import axios from "axios";

function Box(){

  //Funkce pro zjisteni dne pred urcitym poctem dnu

  function subtractDays(date, days){
    date.setDate(date.getDate() - days);

    return date;
  }

  //Dnesni datum a datum rok zpatky

  const todayDate = new Date().toISOString().slice(0, 10);

  var minDate = subtractDays(new Date(), 365).toISOString().slice(0, 10);

  //useState pro vybrani datumu a array obrazku

  const [date,setDate] = useState(todayDate);

  const [images,setImages] = useState([]);
  const noImage = [{"id":"1","timestamp":"","data":"https://www.kitesportcentre.com/wp-content/uploads/camera_off.png"}];

  //Pripojeni na databazi po kazde zmene datumu

  useEffect(() => {


    axios.post('https://web-xp6b3zn.hstnw.eu',({
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

  //Otevreni 1 hodiny z celeho dne

  const [IsOpen, setIsOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null);

  const toggleIsOpen = () => {
    setIsOpen(current => !current);
  };

  //Vysledne zobrazeni

  
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