import './App.css';
import Box from './Box.js';
import BoxSetStyle from './Box.js';

function App() {
  return (
    <>
      <Box />
    </>
  );
}

document.getElementById("body").onload = function() {BoxSetStyle()};

export default App;
