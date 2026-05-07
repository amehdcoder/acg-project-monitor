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

const emit = () => listeners.forEach((listener) => listener());

export const getAppUpdateState = () => state;

export const subscribeToAppUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
  return Number.isFinite(sec) && sec >= 15 ? sec * 1000 : 30 * 1000;
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

export const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") || window.location.hostname.includes("lovableproject.com"));

export const shouldSkipServiceWorker = isInIframe || isPreviewHost;

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
  } catch {}
};

const textHash = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `html-${h}`;
};

const fetchVersionBuildId = async (): Promise<string | null> => {
  const res = await fetch(`/version.json?__probe=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data?.buildId === "string" && data.buildId.trim() ? data.buildId.trim() : null;
};

const fetchHtmlBuildId = async (): Promise<string | null> => {
  const res = await fetch(`/?__probe=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  return textHash(await res.text());
};

export const markServiceWorkerUpdateAvailable = () => {
  const buildId = `sw-${Date.now()}`;
  setState({
    status: "available",
    updateAvailable: true,
    latestBuildId: buildId,
    lastCheckedAt: Date.now(),
    error: null,
    source: "service-worker",
  });
};

export const registerServiceWorkerUpdater = (fn: () => Promise<void>) => {
  swUpdater = fn;
};

export const checkForAppUpdate = async (opts: { force?: boolean; source?: "version" | "html" } = {}) => {
  if (!opts.force && !isAutoUpdateEnabled()) return state;
  setState({ status: "checking", error: null });

  try {
    const source = opts.source || "version";
    const latestBuildId = (source === "html" ? await fetchHtmlBuildId() : await fetchVersionBuildId()) ||
      (await fetchHtmlBuildId());

    if (!latestBuildId) throw new Error("Unable to read latest app version");

    const currentBuildId = source === "html" ? sessionStorage.getItem("app_html_build_id_v1") || latestBuildId : CURRENT_BUILD_ID;
    if (source === "html" && !sessionStorage.getItem("app_html_build_id_v1")) {
      sessionStorage.setItem("app_html_build_id_v1", latestBuildId);
    }

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
    return state;
  } catch (error: any) {
    setState({
      status: "error",
      updateAvailable: state.updateAvailable,
      lastCheckedAt: Date.now(),
      error: error?.message || "Update check failed",
    });
    return state;
  }
};

export const hardReloadToLatest = async () => {
  setState({ status: "updating", error: null });
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {}
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {}

  if (swUpdater) {
    try {
      await swUpdater();
      return;
    } catch {}
  }

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((registrations || []).map((registration) => registration.unregister()));
  } catch {}

  const url = new URL(window.location.href);
  url.searchParams.set("__app_update", Date.now().toString());
  window.location.replace(url.toString());
};

export const startAppUpdatePolling = () => {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const check = () => checkForAppUpdate({ source: shouldSkipServiceWorker ? "html" : "version" });
  const restart = () => {
    if (intervalId) clearInterval(intervalId);
    if (stopped) return;
    intervalId = setInterval(check, Math.max(getPollMs(), 15000));
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