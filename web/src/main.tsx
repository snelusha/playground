import "@/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/app";
import { BrowserFS } from "./lib/browser-fs";

BrowserFS.getInstance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
