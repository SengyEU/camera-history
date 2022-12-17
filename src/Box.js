import React from "react";
import { useState } from "react";


function Box(){
var items = [];

for(var i = 1; i <= 12; i++){
    items.push(i)
};

document.querySelectorAll(".box").forEach((box, index) => {
    box.style.backgroundPosition=(index * (-800 / items.length)) + "px 0%";
    box.style.setProperty("--bright",(0.5 + 0.5 / (index + 1)));
})


  const [IsOpen, setIsOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null);

  var modal = document.querySelector(".modal");
  var modalImg = document.querySelector(".modal-img");

  const toggleIsOpen = () => {
    setIsOpen(true);
    modal.style.display="block";
    modalImg.src=window.getComputedStyle(document.querySelector(".box")).backgroundImage.slice(5, -2);
  };

  var span = document.getElementsByClassName("close")[0];
  const modalClose = () => {
    modal.style.display="none";
  }
  

return (
  <React.Fragment>
    <div class="modal"><span class="close" onClick={modalClose}>&times;</span><img class="modal-img"/></div>
    <div class="wrapper">
    <div class="container">
    {items.map(item => (
        <div key={item} className={"box"} onClick={() => {setOpenItem(item);toggleIsOpen();}}></div>
    ))}
    </div>
    </div>
  </React.Fragment>
);
}

export default Box;