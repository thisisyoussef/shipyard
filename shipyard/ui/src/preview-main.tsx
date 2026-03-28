import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewHarness } from "./preview-harness.js";
import "./styles.css";

const root = document.getElementById("preview-root");
if (!root) throw new Error("Preview root not found");
createRoot(root).render(
  <StrictMode>
    <PreviewHarness />
  </StrictMode>,
);
