import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X } from "lucide-react";

/**
 * PWA auto-update prompt + persistent top banner.
 *
 * Behavior:
 * - In Lovable preview / iframe contexts the service worker is NOT used —
 *   we hard-reload the page when the build hash changes so the editor
 *   preview always reflects the LATEST published version (never a stale
 *   cached green-bg build).
 * - In production (installed PWA / normal browser) we register the SW,
 *   poll for updates at the user-configured interval, and surface both:
 *     1) A bold reactive banner pinned to the very top of the app.
 *     2) The centered "Update Now" modal.
 * - "Remind me later" hides the modal (banner stays) for the configured
 *   snooze window or until a new build is detected.
 */

const SNOOZE_KEY = "pwa_update_snooze_v1";
const BUILD_KEY = "app_build_id_v1";

const readSettings = () => {
  try {
    return JSON.parse(localStorage.getItem("app_settings") || "{}");
  } catch {
    return {};
  }
};
const isAutoUpdateEnabled = (): boolean => readSettings().autoUpdateApp !== false;
const getPollMs = (): number => {
  const s = readSettings();
  const sec = Number(s.updatePollIntervalSec);
  return Number.isFinite(sec) && sec >= 15 ? sec * 1000 : 30 * 1000;
};
const getSnoozeMs = (): number => {
  const s = readSettings();
  const hrs = Number(s.updateSnoozeHours);
  return Number.isFinite(hrs) && hrs > 0 ? hrs * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
};

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com"));
const SKIP_SW = isInIframe || isPreviewHost;

const isSnoozed = (buildId: string): boolean => {
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

/** Hard reload bypassing all caches. */
const hardReload = async () => {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {}
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs || []).map((r) => r.unregister()));
  } catch {}
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {}
  // Cache-bust the URL to force a fresh document fetch
  const url = new URL(window.location.href);
  url.searchParams.set("__v", Date.now().toString());
  window.location.replace(url.toString());
};

/** Preview-mode update detector: hashes the current index.html and reloads
 *  when the hash changes. This guarantees the Lovable preview always shows
 *  the latest published build. */
const usePreviewBuildWatcher = (onNewBuild: () => void) => {
  useEffect(() => {
    if (!SKIP_SW) return;
    let cancelled = false;
    let lastHash = "";

    const fetchHash = async (): Promise<string | null> => {
      try {
        const res = await fetch(`/?__probe=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return null;
        const text = await res.text();
        // Lightweight hash — sum of char codes is enough to detect any change
        let h = 0;
        for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
        return String(h);
      } catch {
        return null;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      const h = await fetchHash();
      if (!h) return;
      if (!lastHash) {
        lastHash = h;
        const stored = sessionStorage.getItem(BUILD_KEY);
        if (stored && stored !== h) onNewBuild();
        sessionStorage.setItem(BUILD_KEY, h);
        return;
      }
      if (h !== lastHash) {
        lastHash = h;
        sessionStorage.setItem(BUILD_KEY, h);
        onNewBuild();
      }
    };

    tick();
    const id = setInterval(tick, Math.max(getPollMs(), 15000));
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [onNewBuild]);
};

interface InnerProps {
  onAvailable: () => void;
  registerSelf: (fn: () => Promise<void>) => void;
}

/** Production-only: registers SW and signals update availability. */
const SwRegistrar = ({ onAvailable, registerSelf }: InnerProps) => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      const startPolling = () => {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(() => {
          if (isAutoUpdateEnabled()) registration.update().catch(() => {});
        }, getPollMs());
      };
      startPolling();
      const onFocus = () => {
        if (isAutoUpdateEnabled()) registration.update().catch(() => {});
      };
      window.addEventListener("focus", onFocus);
      const onSettings = () => startPolling();
      window.addEventListener("app-settings-changed", onSettings);
      window.addEventListener("storage", onSettings);
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    registerSelf(async () => {
      try {
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
      } catch {}
      try {
        localStorage.removeItem(SNOOZE_KEY);
      } catch {}
      updateServiceWorker(true);
    });
  }, [registerSelf, updateServiceWorker]);

  useEffect(() => {
    if (needRefresh) onAvailable();
  }, [needRefresh, onAvailable]);

  return null;
};

const PWAUpdatePrompt = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const buildIdRef = useRef<string>("");
  const swUpdateRef = useRef<(() => Promise<void>) | null>(null);

  const handleAvailable = () => {
    buildIdRef.current = `${Date.now()}`;
    setUpdateAvailable(true);
    if (!isSnoozed(buildIdRef.current)) setShowModal(true);
  };

  usePreviewBuildWatcher(handleAvailable);

  const handleUpdate = async () => {
    if (swUpdateRef.current) {
      try {
        await swUpdateRef.current();
      } catch {}
      setShowModal(false);
      setUpdateAvailable(false);
      return;
    }
    await hardReload();
  };

  const handleSnooze = () => {
    try {
      localStorage.setItem(
        SNOOZE_KEY,
        JSON.stringify({
          until: Date.now() + getSnoozeMs(),
          buildId: buildIdRef.current,
        }),
      );
    } catch {}
    setShowModal(false);
  };

  if (!updateAvailable) return null;

  return (
    <>
      {/* Reactive top banner — always visible while an update is available */}
      <div
        className="fixed inset-x-0 top-0 z-[10000] flex items-center justify-center gap-3 border-b-2 border-primary bg-gradient-to-r from-primary/95 via-primary to-primary/95 px-4 py-2 text-primary-foreground shadow-lg animate-in slide-in-from-top duration-300"
        role="status"
        aria-live="polite"
      >
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="text-sm font-semibold">
          A new version of the app is available
        </span>
        <Button
          onClick={handleUpdate}
          variant="gold"
          size="sm"
          className="h-7 px-3 text-xs font-bold animate-pulse"
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Update now
        </Button>
        <button
          onClick={() => setShowModal(false)}
          className="ml-1 rounded-full p-1 text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
          aria-label="Hide modal"
          title="Hide popup (banner stays until you update)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-update-title"
        >
          <div className="relative mx-4 w-full max-w-md rounded-2xl border-2 border-primary bg-card p-8 shadow-2xl ring-4 ring-primary/20 animate-in zoom-in-95">
            <button
              onClick={handleSnooze}
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/30">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 id="pwa-update-title" className="text-2xl font-bold text-foreground">
                New Update Available
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A new version of the app is ready. Update now to get the latest
                features and fixes.
              </p>
              <Button
                onClick={handleUpdate}
                variant="acg"
                size="lg"
                className="mt-6 w-full text-base font-semibold"
              >
                <RefreshCw className="mr-2 h-5 w-5" />
                Update Now
              </Button>
              <button
                onClick={handleSnooze}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Remind me later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAUpdatePrompt;
