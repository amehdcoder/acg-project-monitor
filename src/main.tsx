import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary from "./components/RootErrorBoundary";
import { installGlobalErrorReporter, recordError } from "./lib/errorReporter";
import "./index.css";

// Install global error capture FIRST so any failure during bootstrap is logged.
installGlobalErrorReporter();

// Last-resort safety net: if anything throws before React mounts (rare),
// surface a minimal recoverable shell instead of a white screen.
window.addEventListener("error", (e) => {
  const root = document.getElementById("root");
  if (root && root.childElementCount === 0) {
    try { recordError("error", e.error || new Error(e.message), { source: e.filename, line: e.lineno, col: e.colno, message: e.message }); } catch {}
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

// Self-heal stale chunks after a deploy: if a dynamic import fails because
// the old chunk hash no longer exists, purge caches and reload once.
const CHUNK_RELOAD_KEY = "__chunk_global_reload__";
const isChunkErr = (msg: string) =>
  /Loading chunk|Failed to fetch dynamically imported|ChunkLoadError|Importing a module script failed|error loading dynamically imported module/i.test(msg || "");

const tryChunkRecover = async (msg: string) => {
  if (!isChunkErr(msg)) return;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    try { const k = await caches.keys(); await Promise.all(k.map((x) => caches.delete(x))); } catch {}
    const u = new URL(location.href);
    u.searchParams.set("__chunk_retry", String(Date.now()));
    location.replace(u.toString());
  } catch {}
};

window.addEventListener("error", (e) => { void tryChunkRecover(e?.message || ""); });
window.addEventListener("unhandledrejection", (e) => {
  const msg = (e?.reason as any)?.message || String(e?.reason || "");
  void tryChunkRecover(msg);
  // Prevent "uncaught (in promise)" log spam from breaking devtools UX
  try { recordError("unhandledrejection", e.reason instanceof Error ? e.reason : new Error(msg), {}); } catch {}
});

// Standard security check for iframe / Lovable preview execution.
// A registered service worker inside the Lovable preview iframe is the
// #1 cause of the "Lovable proxy error" overlay — it intercepts fetches
// the sandbox proxy expects to handle itself. Unregister aggressively
// AND nuke any caches it left behind, so a stale SW from a previously
// published build can never resurrect itself in the preview.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch (e) { return true; }
})();

const isPreviewHostname =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("internal-preview--") ||
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname.includes("lovable.dev"));

if (isInIframe || isPreviewHostname) {
  (async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map((r) => r.unregister()));
    } catch {}
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
  })();
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

// First-paint watchdog: if React never paints anything into #root within
// 8 seconds (stale service worker hijacked a fetch, broken cached chunk,
// failed module preload, etc.), purge every cache + unregister every SW
// and hard-reload to the latest index.html. This is the eternal cure for
// the "white screen of death" after a deploy on any host (Lovable preview,
// acgcollect.lovable.app, or the Hostinger mirror).
const WHITE_SCREEN_GUARD_KEY = "__white_screen_recovery_attempted__";
setTimeout(async () => {
  const root = document.getElementById("root");
  if (!root || root.childElementCount > 0) return; // React painted — all good
  try {
    if (sessionStorage.getItem(WHITE_SCREEN_GUARD_KEY)) return; // already tried once this session
    sessionStorage.setItem(WHITE_SCREEN_GUARD_KEY, "1");
    try { recordError("error", new Error("white-screen-watchdog: #root empty after 8s"), {}); } catch {}
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map((r) => r.unregister()));
    } catch {}
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    const u = new URL(location.href);
    u.searchParams.set("__white_screen_recovery", String(Date.now()));
    location.replace(u.toString());
  } catch {}
}, 8000);

// Once React has painted, clear the guard so a future legitimate failure can self-heal again.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const root = document.getElementById("root");
    if (root && root.childElementCount > 0) {
      try { sessionStorage.removeItem(WHITE_SCREEN_GUARD_KEY); } catch {}
    }
  });
});
