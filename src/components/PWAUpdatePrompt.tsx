import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X, Loader2 } from "lucide-react";
import {
  hardReloadToLatest,
  isSnoozed,
  markServiceWorkerUpdateAvailable,
  registerServiceWorkerUpdater,
  shouldSkipServiceWorker,
  startAppUpdatePolling,
  subscribeToAppUpdates,
  getAppUpdateState,
  isAutoUpdateEnabled,
} from "@/lib/appUpdateManager";

interface InnerProps {
  onAvailable: () => void;
  registerSelf: (fn: () => Promise<void>) => void;
}

const SwRegistrar = ({ onAvailable, registerSelf }: InnerProps) => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const onFocus = () => registration.update().catch(() => {});
      window.addEventListener("focus", onFocus);
      registration.update().catch(() => {});
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
          await Promise.all(names.map((name) => caches.delete(name)));
        }
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
  const [updateState, setUpdateState] = useState(getAppUpdateState());
  const [showModal, setShowModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const lastPromptedBuildRef = useRef("");

  useEffect(() => subscribeToAppUpdates(() => setUpdateState(getAppUpdateState())), []);
  useEffect(() => startAppUpdatePolling(), []);

  useEffect(() => {
    if (!updateState.updateAvailable) return;
    if (lastPromptedBuildRef.current === updateState.latestBuildId) return;
    lastPromptedBuildRef.current = updateState.latestBuildId;

    const latestId = updateState.latestBuildId;

    // Loop guard: if we already auto-applied this exact build id, never re-apply it.
    let lastApplied = "";
    let lastAppliedAt = 0;
    try {
      lastApplied = localStorage.getItem("app_last_applied_build_id") || "";
      lastAppliedAt = Number(localStorage.getItem("app_last_applied_at") || "0") || 0;
    } catch {}
    if (lastApplied && lastApplied === latestId) return;

    // Cooldown: never auto-reload more than once every 2 minutes (covers reload races
    // where the freshly-loaded bundle still reports a different buildId than version.json).
    const COOLDOWN_MS = 2 * 60 * 1000;
    const sinceLast = Date.now() - lastAppliedAt;
    const inCooldown = lastAppliedAt > 0 && sinceLast < COOLDOWN_MS;

    // Offline queue: if we can't actually fetch a fresh bundle, defer until 'online' fires.
    // The polling layer also re-runs the check on the 'online' event.
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

    if (isAutoUpdateEnabled() && !inCooldown && !isOffline) {
      try {
        localStorage.setItem("app_last_applied_build_id", latestId);
        localStorage.setItem("app_last_applied_at", String(Date.now()));
      } catch {}
      hardReloadToLatest().catch((err) => {
        console.error("Auto-update failed, falling back to manual prompt", err);
        if (!isSnoozed(latestId)) setShowModal(true);
      });
      return;
    }

    if (!isSnoozed(latestId)) setShowModal(true);
  }, [updateState.latestBuildId, updateState.updateAvailable]);

  const handleAvailable = () => markServiceWorkerUpdateAvailable();

  const handleUpdate = async () => {
    setIsUpdating(true);
    // Give UI a moment to show the spinner before the hard reload starts clearing caches
    await new Promise(r => setTimeout(r, 100));
    try {
      await hardReloadToLatest();
    } catch (err) {
      console.error("Update failed", err);
      setIsUpdating(false);
    }
  };

  const handleSnooze = () => {
    import("@/lib/appUpdateManager").then(({ snoozeCurrentUpdate }) => snoozeCurrentUpdate());
    setShowModal(false);
  };

  const registerSelf = (fn: () => Promise<void>) => registerServiceWorkerUpdater(fn);

  return (
    <>
      {!shouldSkipServiceWorker && <SwRegistrar onAvailable={handleAvailable} registerSelf={registerSelf} />}

      {updateState.updateAvailable && (
        <>
          <div
            className="fixed inset-x-0 top-0 z-[10000] flex items-center justify-center gap-3 border-b-2 border-primary bg-gradient-to-r from-primary/95 via-primary to-primary/95 px-4 py-2 text-primary-foreground shadow-lg animate-in slide-in-from-top duration-300"
            role="status"
            aria-live="polite"
          >
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span className="text-sm font-semibold">A new published version is available</span>
            <Button onClick={handleUpdate} variant="gold" size="sm" disabled={isUpdating} className="h-7 px-3 text-xs font-bold">
              {isUpdating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              {isUpdating ? "Updating..." : "Update now"}
            </Button>
            <button
              onClick={() => setShowModal(false)}
              className="ml-1 rounded-full p-1 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              aria-label="Hide update popup"
              title="Hide popup; the header update button stays available"
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
                    A new published version is ready. Update now to get the latest features and fixes.
                  </p>
                  <Button onClick={handleUpdate} variant="acg" size="lg" disabled={isUpdating} className="mt-6 w-full text-base font-semibold">
                    {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
                    {isUpdating ? "Installing Update..." : "Update Now"}
                  </Button>
                  <button onClick={handleSnooze} className="mt-3 text-xs text-muted-foreground hover:text-foreground">
                    Remind me later
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default PWAUpdatePrompt;
