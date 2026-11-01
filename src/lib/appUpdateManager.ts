import { prepareSilentFormRestoreForUpdate } from "@/lib/formProgressPersistence";
import { decideUpdate } from "@/lib/appUpdateDecision";

export type AppUpdateStatus = "idle" | "checking" | "current" | "available" | "updating" | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  updateAvailable: boolean;
  currentBuildId: string;
  latestBuildId: string;
  lastCheckedAt: number | null;
  error: string | null;
  source: "version" | "html" | "service-worker" | null;
}

const APP_SETTINGS_KEY = "app_settings";
export const SNOOZE_KEY = "pwa_update_snooze_v1";
export const CURRENT_BUILD_ID = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "development";

let state: AppUpdateState = {
  status: "idle",
  updateAvailable: false,
  currentBuildId: CURRENT_BUILD_ID,
  latestBuildId: CURRENT_BUILD_ID,
  lastCheckedAt: null,
  error: null,
  source: null,
};

const listeners = new Set<() => void>();
let swUpdater: (() => Promise<void>) | null = null;
let checkPromise: Promise<AppUpdateState> | null = null;
let applyPromise: Promise<boolean> | null = null;

const withTimeout = async <T>(task: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]);
  } finally {
    clearTimeout(timer);
  }
};

const probe = async <T>(url: string, read: (res: Response) => Promise<T>): Promise<T> => {
  if (navigator.onLine === false) throw new Error("Connect to the internet to check for updates. Your saved work is still available.");
  const controller = new AbortController();
  try {
    return await withTimeout((async () => {
      const res = await fetch(url, {
        cache: "no-store", credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" }, signal: controller.signal,
      });
      if (!res.ok) throw new Error("The update service is unavailable. Please try again.");
      return read(res);
    })(), 7000, "The update check timed out. Please try again when your connection is stable.");
  } finally {
    controller.abort();
  }
};

const emit = () => listeners.forEach((listener) => listener());

export const getAppUpdateState = () => state;

export const subscribeToAppUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const setState = (next: Partial<AppUpdateState>) => {
  state = { ...state, ...next };
  emit();
};

export const readAppSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
};

export const isAutoUpdateEnabled = (): boolean => readAppSettings().autoUpdateApp !== false;

export const getPollMs = (): number => {
  const sec = Number(readAppSettings().updatePollIntervalSec);
  return Number.isFinite(sec) && sec >= 10 ? sec * 1000 : 15 * 1000;
};

export const getSnoozeMs = (): number => {
  const hrs = Number(readAppSettings().updateSnoozeHours);
  return Number.isFinite(hrs) && hrs > 0 ? hrs * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
};

export const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const hostname = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
const firstLabel = hostname.split('.')[0];
export const isPreviewHost = hostname === "localhost" || hostname === "127.0.0.1" ||
  /(?:^|\.)(?:lovableproject\.com|lovableproject-dev\.com|beta\.lovable\.dev)$/.test(hostname) ||
  ((hostname.endsWith('.lovable.app') || hostname.endsWith('.gpt-eng.com') || hostname.endsWith('.gptengineer.run')) && /^(?:(?:id-preview|preview)(?:-[a-z0-9]+)?--.+|project--.+-dev)$/.test(firstLabel)) ||
  hostname.includes("internal-preview--") || hostname.includes("amehnities-preview.internal");
export const shouldSkipServiceWorker = !import.meta.env.PROD || isInIframe || isPreviewHost || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sw') === 'off');

export const isSnoozed = (buildId: string): boolean => {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const { until, buildId: snoozedBuild } = JSON.parse(raw);
    if (!until || Date.now() > until) return false;
    if (snoozedBuild && snoozedBuild !== buildId) return false;
    return true;
  } catch {
    return false;
  }
};

export const snoozeCurrentUpdate = () => {
  try {
    localStorage.setItem(
      SNOOZE_KEY,
      JSON.stringify({ until: Date.now() + getSnoozeMs(), buildId: state.latestBuildId }),
    );
  } catch (error) {
    console.warn("[UpdateManager] Unable to save update snooze", error);
  }
};

const textHash = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `html-${h}`;
};

const fetchVersionBuildId = async (): Promise<string | null> => {
  try {
    const data = await probe(`/version.json?__probe=${Date.now()}`, res => res.json());
    return typeof data?.buildId === "string" && data.buildId.trim() ? data.buildId.trim() : null;
  } catch (e) {
    console.warn("[UpdateManager] Failed to fetch version.json", e);
    return null;
  }
};

const htmlBuildId = (html: string): string | null => {
  // Only compiled app assets are evidence of a release; icons, metadata and
  // development/HMR scripts must never create a false update notification.
  const scripts = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
    .map(m => m[1]).filter(src => /\/assets\/.*\.js(?:\?|$)/.test(src)).sort();
  const styles = Array.from(html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi))
    .map(m => m[1]).filter(src => /\/assets\/.*\.css(?:\?|$)/.test(src)).sort();
  return scripts.length ? textHash(`${scripts.join(",")}|${styles.join(",")}`) : null;
};

const fetchHtmlBuildId = async (): Promise<string | null> => {
  try {
    return htmlBuildId(await probe(`/?__probe=${Date.now()}`, res => res.text()));
  } catch (e) {
    console.error("[UpdateManager] Failed to fetch HTML for update check", e);
    return null;
  }
};

export const markServiceWorkerUpdateAvailable = () => {
  void checkForAppUpdate({ force: true });
};

export const registerServiceWorkerUpdater = (fn: () => Promise<void>) => {
  swUpdater = fn;
};

export const checkForAppUpdate = (opts: { force?: boolean; source?: "version" | "html" } = {}): Promise<AppUpdateState> => {
  if (applyPromise) return Promise.resolve(state);
  if (checkPromise) return checkPromise;
  checkPromise = runUpdateCheck(opts).finally(() => { checkPromise = null; });
  return checkPromise;
};

const runUpdateCheck = async (opts: { force?: boolean; source?: "version" | "html" }) => {
  if (!opts.force && !isAutoUpdateEnabled()) return state;
  if (!opts.force && isPreviewHost) return state;
  setState({ status: "checking", error: null });

  try {
    let source: "version" | "html" = "version";

    // IMPORTANT: never mix probe sources. Comparing an HTML asset-hash against the
    // compiled build id (CURRENT_BUILD_ID) can NEVER match, which used to flag a
    // permanent, false "update available" (stuck banner + unresponsive button)
    // whenever version.json was momentarily unreachable. Each source is now
    // compared only against its own baseline.
    let latestBuildId: string | null;
    let currentBuildId: string;

    latestBuildId = await fetchVersionBuildId();
    currentBuildId = CURRENT_BUILD_ID;
    if (!latestBuildId && !isPreviewHost) {
      source = "html";
      latestBuildId = await fetchHtmlBuildId();
      // If the HTML probe genuinely fails, treat it as "unknown" and DO NOT flag
      // an update — a transient network blip must never surface the banner.
      if (!latestBuildId) {
        throw new Error("Couldn't verify the latest version. Check your connection and try again.");
      }
      // Compare against the shell actually running, never a freshly fetched
      // baseline or session value that may describe a different source.
      const runningHtmlId = htmlBuildId(document.documentElement.outerHTML);
      if (!runningHtmlId) throw new Error("Couldn't verify this app version. Please try again.");
      currentBuildId = runningHtmlId;
    }
    if (!latestBuildId) throw new Error("Couldn't check for updates. Check your connection and try again.");

    const changed = latestBuildId !== currentBuildId;
    setState({
      status: changed ? "available" : "current",
      updateAvailable: changed,
      currentBuildId,
      latestBuildId,
      lastCheckedAt: Date.now(),
      error: null,
      source: source === "html" ? "html" : "version",
    });
    // NOTE: We intentionally do NOT auto-apply updates here. A published build
    // must never refresh a user's app on its own — that was causing users to
    // lose in-progress work when the Owner published a build. The new build is
    // only surfaced via the "Update" button (updateAvailable = true); the reload
    // happens exclusively when the user taps it (see AppUpdateButton →
    // hardReloadToLatest). This guarantees zero self-initiated refreshes.
    return state;

  } catch (error: unknown) {
    setState({
      status: "error",
      lastCheckedAt: Date.now(),
      error: error instanceof Error ? error.message : "Update check failed",
    });
    return state;
  }
};

export const APPLIED_BUILD_AT_KEY = "app_last_applied_at_v1";
export const APPLIED_BUILD_ID_KEY = "app_last_applied_build_v1";

export const getLastAppliedAt = (): number | null => {
  try {
    const raw = localStorage.getItem(APPLIED_BUILD_AT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const persistAppliedBuild = (buildId: string) => {
  try {
    localStorage.setItem(APPLIED_BUILD_ID_KEY, buildId);
    localStorage.setItem(APPLIED_BUILD_AT_KEY, String(Date.now()));
  } catch (e) {
    console.warn("[UpdateManager] Unable to persist applied build metadata", e);
  }
};

// On first load, if the running build differs from the stored applied build,
// stamp the timestamp now — this is the "last update received" the user sees.
try {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(APPLIED_BUILD_ID_KEY);
    if (stored !== CURRENT_BUILD_ID) {
      persistAppliedBuild(CURRENT_BUILD_ID);
    } else if (!localStorage.getItem(APPLIED_BUILD_AT_KEY)) {
      persistAppliedBuild(CURRENT_BUILD_ID);
    }
  }
} catch {}

export const hardReloadToLatest = (_opts: { force?: boolean } = {}): Promise<boolean> => {
  if (applyPromise) return applyPromise;
  applyPromise = applyLatest().finally(() => { applyPromise = null; });
  return applyPromise;
};

const applyLatest = async (): Promise<boolean> => {
  setState({ status: "updating", error: null });
  try {
    // Even a manual/forced request must not strand an offline user. Validate
    // the actual HTML shell, not merely a reachable JSON/404 fallback page.
    const html = await probe(`/?__reload_probe=${Date.now()}`, res => res.text());
    if (!/<script[^>]+src=/i.test(html) || !/id=["']root["']/i.test(html)) {
      throw new Error("The latest app couldn't be loaded. Your current app and saved work are unchanged.");
    }
    prepareSilentFormRestoreForUpdate();
    if (swUpdater && !shouldSkipServiceWorker) {
      await withTimeout(swUpdater(), 12000, "The update couldn't finish downloading. Please try again.");
    }
    // Retain workers, precaches, reference data and all offline queues. Only
    // invalidate navigation runtime HTML after the new shell is reachable.
    if (typeof caches !== "undefined") {
      await withTimeout(caches.delete("html-cache"), 2000, "Cache refresh timed out").catch(() => {});
    }
    if (navigator.onLine === false) throw new Error("Connection lost. Reconnect and tap Update again; your saved work is protected.");
    try { localStorage.removeItem(SNOOZE_KEY); } catch { /* optional metadata */ }
    const url = new URL(window.location.href);
    url.searchParams.delete("__app_update");
    url.searchParams.set("__v", String(Date.now()));
    window.location.replace(url.toString());
    // Applied-build metadata is stamped only by the build that actually boots.
    return true;
  } catch (error) {
    setState({ status: "error", error: error instanceof Error ? error.message : "Couldn't apply the update. Please try again." });
    return false;
  }
};

export const startAppUpdatePolling = () => {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  if (isPreviewHost) return () => {};

  const check = () => { if (document.visibilityState !== "hidden") void checkForAppUpdate(); };
  const restart = () => {
    if (intervalId) clearInterval(intervalId);
    if (stopped) return;
    intervalId = setInterval(check, Math.max(getPollMs(), 10000));
  };

  check();
  restart();
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  window.addEventListener("visibilitychange", check);
  window.addEventListener("app-settings-changed", restart);
  window.addEventListener("storage", restart);

  return () => {
    stopped = true;
    if (intervalId) clearInterval(intervalId);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    window.removeEventListener("visibilitychange", check);
    window.removeEventListener("app-settings-changed", restart);
    window.removeEventListener("storage", restart);
  };
};