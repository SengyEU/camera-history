import React from "react";
import ReactDOM from "react-dom/client";
import "@ch/design/index.css";
import { App } from "./App";
import { setupEmbedResize } from "./embedResize";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

setupEmbedResize();