import React from "react";
import { useState } from "react";



function Box(){

var items = [];

for(var i = 1; i <= 12; i++){
    items.push(i)
};

document.querySelectorAll(".box").forEach((box, index) => {
  box.style.setProperty("--bgpos",(index * (-800 / items.length)) + "px 0%");
  box.style.setProperty("--bright",(0.2 + 0.8 / (index + 1)));
})

  const [IsOpen, setIsOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null);

  const toggleIsOpen = () => {
    setIsOpen(current => !current);
  };
  
return (
  <>
    <div class="wrapper">
    <div class="container">
    {items.map(item => (
        <div key={item} className={`box ${openItem === item && IsOpen  ? 'active' : ''}`} onClick={() => {setOpenItem(item);toggleIsOpen();}}>{item} AM</div>
    ))}
    </div>
    </div>
  </>
);
}

export default Box;