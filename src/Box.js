import React, { useEffect, useState } from "react";
import axios from "axios";

function Box(){

  //Funkce pro zjisteni dne pred urcitym poctem dnu

  function subtractDays(date, days){
    date.setDate(date.getDate() - days);

    return date;
  }

  //Dnesni datum a datum rok zpatky

  const queryParams = new URLSearchParams(window.location.search)

  const URLDate = queryParams.get("date");
  const URLHour = queryParams.get("hour");

  const todayDate = new Date().toISOString().slice(0, 10);

  var minDate = subtractDays(new Date(), 365).toISOString().slice(0, 10);

  //useState pro vybrani datumu a array obrazku

  const [date, setDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("date") || new Date().toISOString().slice(0, 10);
  });

  const [images,setImages] = useState([]);
  const noImage = [{"id":"1","timestamp": "" ,"data":"https://www.kitesportcentre.com/wp-content/uploads/camera_off.png"}];

  //Pripojeni na databazi po kazde zmene datumu

  useEffect(() => {
  function handleURLParameters() {
    if (URLDate) {
      setDate(URLDate);
    }     
    if (URLHour && images.length > 0) {
      const itemToOpen = images.find(
        (image) => new Date(image.timestamp).getHours() === parseInt(URLHour, 10)
      );
      if (itemToOpen) {
        setOpenItem(itemToOpen.id);
        setIsOpen(true);
      }
    }
  }
  handleURLParameters();
}, [URLDate, URLHour, images.length]);

  useEffect(() => {
  // Find and open the specified hour's image
  if (URLHour && images.length > 0) {
    const itemToOpen = images.find(
      (image) => new Date(image.timestamp).getHours() === parseInt(URLHour, 10)
    );
      if (itemToOpen) {
        setOpenItem(itemToOpen.id);
        setIsOpen(true);
      }

  }
}, [URLHour, images]);

  useEffect(() => {


    axios.post('http://130.61.200.245:20000/api.php',({
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '130.61.200.245:20000'
    },
      datum: date
    })).then(function (response) {

      if (response.data.length === 0) {
        setImages(noImage);
        setIsOpen(false);
      }
      else{
        setImages(response.data);
        setIsOpen(false);
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

  useEffect(() => {
    const handleResize = () => {
      forceUpdate();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const [, updateState] = useState();
  const forceUpdate = () => updateState({});

  const [modalDateTime, setModalDateTime] = useState("");
  const [url, setUrl] = useState("");

  const [metaHour, setMetaHour] = useState("");

  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    const input = document.getElementById("inputField");
    input.select();
    if (document.execCommand("copy")) {
      setIsCopied(true);
      setTimeout(() => {
        window.getSelection().removeAllRanges();
        setIsCopied(false);
      }, 3000);
    }
  };

  const [isOpenedModal, setIsOpenedModal] = useState(false);

  const closeModal = () => {
    document.querySelector(".popup").classList.remove("show");
    setIsOpenedModal(false);
  }

return (
  <>
  <div className="wrapper">
    <div className="container">
      {images.map((image, index) => (
        <div
          key={image.id}
          className={`box ${
            openItem === image.id && IsOpen ? "active" : ""
          }`}
          onClick={() => {
            setOpenItem(image.id);
            toggleIsOpen();
          }}
          style={{
            backgroundImage: `url(${image.data})`,
            "--bgpos":
              index * (-document.querySelector(".container").offsetWidth / images.length) +
              "px 0%",
          }}
        >
          {openItem === image.id && IsOpen && (
            <>
            <div className="arrows">
              {index > 0 && (
                <div
                  className="arrow left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenItem(images[index - 1].id);
                  }}
                >
                  {"<"}
                </div>
              )}
              {index < images.length - 1 && (
                <div
                  className="arrow right"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenItem(images[index + 1].id);
                  }}
                >
                  {">"}
                </div>
              )}
            </div>
            <div className="share-button" 
            onClick={(e) =>{
              e.stopPropagation();

              setModalDateTime(date.split("-").reverse().join(".") + " " + (new Date(image.timestamp).toLocaleString('en-US', {
                hour: 'numeric',
                hour12: true
              })).replace(/\s+/g, ''));
              document.querySelector(".popup").classList.add("show");
              const baseUrl = window.location.origin + window.location.pathname;
              setUrl(`${baseUrl}?date=${date}&hour=${new Date(image.timestamp).getHours()}`);
              setMetaHour(new Date(image.timestamp).getHours());
              setIsOpenedModal(true);
            
            }}
              >
              <i className="fa fa-share-alt"></i>
            </div>
            </>
          )}
          <div>
            {image.timestamp && (
              new Date(image.timestamp).toLocaleString('en-US', {
                hour: 'numeric',
                hour12: true
              }).replace(/\s+/g, '')
            )}
          </div>

        </div>
      ))}
    </div>
    <div className="calendar-wrapper">
      {/* Šipka DOZADU */}
      <button 
        className="nav-btn"
        onClick={() => {
          const prev = new Date(date);
          prev.setDate(prev.getDate() - 1);
          const newDate = prev.toISOString().slice(0, 10);
          if (newDate >= minDate) {
            setDate(newDate);
            window.history.replaceState(null, null, `?date=${newDate}`);
          }
        }}
        disabled={date <= minDate}
      >
        <i className="fa fa-chevron-left"></i>
      </button>

      <input
        className="calendar"
        type="date"
        onChange={(e) => {
          const selectedDate = e.target.value;
          if (selectedDate >= minDate && selectedDate <= todayDate) {
            setDate(selectedDate);
            const searchParams = new URLSearchParams(window.location.search);
            searchParams.set("date", selectedDate);
            searchParams.delete("hour"); // Smažeme hodinu při změně dne
            window.history.replaceState(null, null, `?${searchParams.toString()}`);
          }
        }}
        value={date}
        min={minDate}
        max={todayDate}
      />

      {/* Šipka DOPŘEDU */}
      <button 
        className="nav-btn"
        onClick={() => {
          const next = new Date(date);
          next.setDate(next.getDate() + 1);
          const newDate = next.toISOString().slice(0, 10);
          if (newDate <= todayDate) {
            setDate(newDate);
            window.history.replaceState(null, null, `?date=${newDate}`);
          }
        }}
        disabled={date >= todayDate}
      >
        <i className="fa fa-chevron-right"></i>
      </button>
    </div>
  </div>
  {isOpenedModal && <div className="overlay" onClick={() => {closeModal()}}></div>}
    <div className="popup">
      <header>
        <span>{modalDateTime}</span>
        <div className="close" onClick={() => {closeModal()}}><i className="uil uil-times"></i></div>
      </header>
      <div className="content">
        <p>Share link to this image via</p>
        <ul className="icons">
          <a href={"https://www.facebook.com/sharer/sharer.php?u=" + url} target="_blank"><i className="fab fa-facebook-f"></i></a>
          <a href={"https://twitter.com/intent/tweet?text=" + url} target="_blank"><i className="fab fa-twitter"></i></a>
          <a href={"https://wa.me/?text=" + url} target="_blank"><i className="fab fa-whatsapp"></i></a>
          <a href={"https://t.me/share/url?url=" + url}target="_blank"><i className="fab fa-telegram-plane"></i></a>
        </ul>
        <p>Or copy link</p>
        <div className="field">
          <i className="url-icon uil uil-link"></i>
          <input id="inputField" type="text" readOnly value={url} />
          <button onClick={handleCopy}>{isCopied ? "Copied" : "Copy"}</button>
        </div>
      </div>
    </div>
  </>
  );  
}

export default Box;