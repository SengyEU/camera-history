import logo from './logo.svg';
import './App.css';

var items = [];
for(var i = 1; i <= 12; i++){
    items.push(i);
}
let itemlist=[];
items.forEach((item,index)=>{
  itemlist.push( <div key={index}class={"box i" + item}></div>)
})

function App() {
  return (
    <div class="container">
      {itemlist}
    </div>
  );
}

export default App;
