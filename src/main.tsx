import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary from "./components/RootErrorBoundary";
import "./index.css";

// Last-resort safety net: if anything throws before React mounts (rare),
// surface a minimal recoverable shell instead of a white screen.
window.addEventListener("error", (e) => {
  const root = document.getElementById("root");
  if (root && root.childElementCount === 0) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;padding:24px;">
        <div style="max-width:420px;text-align:center;">
          <div style="font-size:42px;">⚠️</div>
          <h1 style="font-size:20px;margin:8px 0;">App failed to start</h1>
          <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${(e?.message || "Unknown error").toString().slice(0, 200)}</p>
          <button onclick="(async()=>{try{const n=await caches.keys();await Promise.all(n.map(x=>caches.delete(x)));const r=await navigator.serviceWorker?.getRegistrations();await Promise.all((r||[]).map(x=>x.unregister()));}catch(_){};const u=new URL(location.href);u.searchParams.set('__app_update',Date.now());location.replace(u.toString());})()" style="padding:10px 18px;border:none;border-radius:8px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Refresh to latest</button>
        </div>
      </div>`;
  }
});

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

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
