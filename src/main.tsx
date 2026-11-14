import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

// Boot-level failures must be visible: a blank page tells the visitor nothing.
function bootError(label: string, detail: unknown): void {
  const text = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ""}` : String(detail);
  console.error(`[TerraTwin] ${label}`, detail);
  const host = document.getElementById("root");
  if (host && !host.childElementCount) {
    host.innerHTML =
      `<div class="shell"><div class="errorbox"><b>${label}</b><code></code></div></div>`;
    host.querySelector("code")!.textContent = text;
  }
}

window.addEventListener("error", (e) => bootError("Script failed to load or run", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => bootError("Unexpected failure", e.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
