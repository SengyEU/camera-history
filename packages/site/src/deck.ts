import Reveal from "reveal.js";
import "reveal.js/reveal.css";
import "./deck.css";

const deck = new Reveal({
  hash: true,
  slideNumber: true,
  controls: true,
  progress: true,
  transition: "fade",
  width: 1280,
  height: 720,
});

void deck.initialize();
