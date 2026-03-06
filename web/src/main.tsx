import "@/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { enableMapSet } from "immer";
enableMapSet();

import App from "@/app";
import { FSProvider } from "@/lib/fs/fs-provider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FSProvider>
      <App />
    </FSProvider>
  </StrictMode>,
);
