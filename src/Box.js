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

  const [date,setDate] = useState(todayDate);

  const [images,setImages] = useState([]);
  const noImage = [{"id":"1","timestamp":"","data":"https://www.kitesportcentre.com/wp-content/uploads/camera_off.png"}];

  //Pripojeni na databazi po kazde zmene datumu

  useEffect(() => {
    // Function to handle URL parameters
    function handleURLParameters() {
      if (URLDate) {
        setDate(URLDate);
      } else {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.set("date", date); // Use todayDate instead of URLDate here
        const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
        window.history.replaceState(null, null, newUrl);
        setDate(todayDate);
      }

        const itemToOpen = images.find(
          (image) =>
            new Date(image.timestamp).getHours() === parseInt(URLHour, 10)
        );

        if (itemToOpen) {
          setOpenItem(itemToOpen.id);
          setIsOpen(true);
      }
    }

    // Execute handleURLParameters on component mount and when URLDate/URLHour change
    handleURLParameters();
  }, [URLDate, URLHour]);

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


    axios.post('https://web-xp6b3zn.hstnw.eu',({
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'web-xp6b3zn.hstnw.eu'
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
              setUrl("https://sengyeu.github.io/camera-history/?date=" + date + "&hour=" + (new Date(image.timestamp).getHours()));
              setMetaHour(new Date(image.timestamp).getHours());
              setIsOpenedModal(true);
            
            }}
              >
              <i className="fa fa-share-alt"></i>
            </div>
            </>
          )}
          <div>
            {(new Date(image.timestamp).toLocaleString('en-US', {
            hour: 'numeric',
            hour12: true
          })).replace(/\s+/g, '')}
          </div>

        </div>
      ))}
    </div>
    <input
      className="calendar"
      type="date"
      onChange={(e) => {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete("hour");
        searchParams.delete("date");
        const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
        window.history.replaceState(null, null, newUrl);
        const selectedDate = e.target.value;
        // Perform any validation if needed before updating the state
        if (selectedDate >= minDate && selectedDate <= todayDate) {
          setDate(selectedDate);
        } else {
          // Handle invalid date input here (e.g., show a warning message)
          console.log("Invalid date input.");
        }
      }}
      value={date}
      min={minDate}
      max={todayDate}
    />
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