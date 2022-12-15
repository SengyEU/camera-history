import logo from './logo.svg';
import './App.css';

var items = [];
for(var i = 1; i <= 12; i++){
  items.push( <div key={i}class={"box i" + i}></div>)
}

function App() {
  return (
    <div class="container">
      {items}
    </div>
  );
}

document.querySelectorAll(".container > .box").forEach((box, index) => {
  box.style.setProperty("--brightness", Math.pow(.8333, index));
  box.style.setProperty("--bgpos", Math.pow(-66.666, index));
})


export default App;
