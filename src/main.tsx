import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Standard security check for iframe execution
const isInIframe = (() => {
  try { return window.self !== window.top; } catch (e) { return true; }
})();

if (isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}


// Restore font size preference
const savedFontSize = localStorage.getItem("app_font_size");
if (savedFontSize) {
  document.documentElement.style.fontSize = savedFontSize === "small" ? "14px" : savedFontSize === "large" ? "18px" : savedFontSize === "x-large" ? "20px" : "16px";
}

// Restore CVD mode
const savedCvd = localStorage.getItem("app_cvd_mode");
if (savedCvd && savedCvd !== "default") {
  document.documentElement.setAttribute("data-cvd", savedCvd);
}

// Restore accessibility prefs
try {
  const a11y = JSON.parse(localStorage.getItem("a11y_prefs") || "{}");
  if (a11y.readingMode) document.documentElement.setAttribute("data-reading-mode", "true");
  if (a11y.largeClickTargets) document.documentElement.setAttribute("data-large-targets", "true");
  if (a11y.reducedMotion) document.documentElement.style.setProperty("--animation-duration", "0s");
} catch {}

createRoot(document.getElementById("root")!).render(<App />);
