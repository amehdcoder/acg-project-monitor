// Compatibility polyfills MUST be the very first import so missing browser
// APIs (e.g. crypto.randomUUID on old Android WebViews) are patched before any
// component renders and crashes.
import { installCompatPolyfills } from "./lib/compat/polyfills";
installCompatPolyfills();

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary from "./components/RootErrorBoundary";
import { installGlobalErrorReporter, recordError } from "./lib/errorReporter";
import { initOfflineMedia } from "./lib/offlineMedia";
import { initOfflineSubmissions } from "./lib/offlineSubmissions";
import { initSavedFormAutoSync } from "./lib/savedFormAutoSync";
import { initGeographyCache } from "./lib/geographyCache";
import { initSpecialFormReconcile } from "./lib/specialFormReconcile";
import { prepareSilentFormRestoreForUpdate } from "./lib/formProgressPersistence";
import { installAfterHoursInterceptor } from "./lib/afterHours/interceptor";
import { requestPersistentStorage } from "./lib/storagePersistence";
import "./index.css";

// Gate all form submissions during the locked evening window (7 PM–8 AM WAT).
installAfterHoursInterceptor();

// Ask the OS to treat our offline IndexedDB data (queues, saved forms, audit
// ledger) as persistent so it is exempt from automated background eviction.
void requestPersistentStorage();

// Drain any queued offline media + submissions as soon as the app boots /
// regains connectivity.
initOfflineMedia();
initOfflineSubmissions();
initSavedFormAutoSync();
// Seed the offline-first State→LGA→Ward geography lookup table into IndexedDB
// once (skips the write entirely if a current copy already exists). The pickers
// work synchronously from the bundled dataset while this resolves.
void initGeographyCache();
// Self-heal any special-form mirrors stuck showing "queued" after their row
// already reached the server.
initSpecialFormReconcile();

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
          <button onclick="(async()=>{try{const a=JSON.parse(localStorage.getItem('amehnities_active_form_fill_v1')||'null');if(a&&a.formId&&a.hasUserProgress===true){sessionStorage.setItem('amehnities_silent_update_restore_v1',JSON.stringify({formId:a.formId,draftKey:'form_draft_'+a.formId,at:Date.now()}));}}catch(_){}if(navigator.onLine===false){alert('Your saved app is still available. Connect to the internet before refreshing to the latest version.');return;}const u=new URL(location.href);u.searchParams.set('__app_update',Date.now());location.replace(u.toString());})()" style="padding:10px 18px;border:none;border-radius:8px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Refresh to latest</button>
        </div>
      </div>`;
  }
});

// Self-heal stale chunks after a deploy: if a dynamic import fails because
// the old chunk hash no longer exists, reload once only after proving the
// branded domain is reachable. This avoids stranding weak-network Android
// users on Chrome's generic "site can't be reached" page.
const CHUNK_RELOAD_KEY = "__chunk_global_reload__";
const isChunkErr = (msg: string) =>
  /Loading chunk|Failed to fetch dynamically imported|ChunkLoadError|Importing a module script failed|error loading dynamically imported module/i.test(msg || "");

const canReachAppShell = async () => {
  if (navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`/version.json?__shell_probe=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
};

const tryChunkRecover = async (msg: string) => {
  if (!isChunkErr(msg)) return;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    if (!(await canReachAppShell())) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    prepareSilentFormRestoreForUpdate();
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

// Background geography hydration: after first paint, quietly warm the GRID3
// manifest + state-name index (only when online) so the cascading location
// dropdowns in the MDA checklists open instantly with no network wait. Runs
// during idle time and never blocks the UI.
{
  const warmGeo = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    import("./lib/grid3NigeriaData")
      .then((m) => m.hydrateGrid3Cache())
      .catch(() => { /* best-effort, never throws */ });
  };
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(warmGeo, { timeout: 6000 });
  else setTimeout(warmGeo, 3000);
}


// First-paint watchdog: if React never paints anything into #root within
// 8 seconds, recover without deleting the offline app shell. Reload only when
// the branded host is reachable; otherwise show a local recovery panel.
const WHITE_SCREEN_GUARD_KEY = "__white_screen_recovery_attempted__";
setTimeout(async () => {
  const root = document.getElementById("root");
  if (!root || root.childElementCount > 0) return; // React painted — all good
  try {
    if (sessionStorage.getItem(WHITE_SCREEN_GUARD_KEY)) return; // already tried once this session
    sessionStorage.setItem(WHITE_SCREEN_GUARD_KEY, "1");
    prepareSilentFormRestoreForUpdate();
    try { recordError("error", new Error("white-screen-watchdog: #root empty after 8s"), {}); } catch {}
    if (!(await canReachAppShell())) {
      root.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;padding:24px;background:#f5f7fa;color:#0f172a;">
          <div style="max-width:420px;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;box-shadow:0 18px 45px rgba(15,23,42,.12);">
            <div style="font-size:42px;">📡</div>
            <h1 style="font-size:20px;margin:8px 0;">Connection unavailable</h1>
            <p style="font-size:13px;color:#64748b;margin:0 0 16px;">Reconnect to the internet, then reopen Amehnities. Your saved offline data remains protected on this device.</p>
            <button onclick="location.reload()" style="padding:10px 18px;border:none;border-radius:8px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Try again</button>
          </div>
        </div>`;
      return;
    }
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
