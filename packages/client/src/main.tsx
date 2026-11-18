import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles/design-system.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing #root mount node");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
