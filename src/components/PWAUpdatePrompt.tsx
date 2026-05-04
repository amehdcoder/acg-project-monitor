import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X } from "lucide-react";

/**
 * PWA auto-update prompt.
 * - Polls for updates at the user-configured interval (default 30s).
 * - Shows a bold, centered modal when a new SW is detected.
 * - "Remind me later" snoozes the modal for the user-configured duration
 *   (default 1 day) until the next genuinely new build is detected.
 */

const SNOOZE_KEY = "pwa_update_snooze_v1"; // { until: number; buildId: string }

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

/** Identifier representing the current "available update" so a brand-new
 *  build invalidates an existing snooze. We don't have a build hash here,
 *  so we use the first-detected timestamp bucketed per session as a proxy. */
const currentBuildId = () => {
  // Increment per page load — every fresh SW update event creates a new id.
  return `${Date.now()}`;
};

const isSnoozed = (buildId: string): boolean => {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const { until, buildId: snoozedBuild } = JSON.parse(raw);
    if (!until || Date.now() > until) return false;
    // Different build => snooze no longer applies
    if (snoozedBuild && snoozedBuild !== buildId) return false;
    return true;
  } catch {
    return false;
  }
};

const PWAUpdatePrompt = () => {
  const [showModal, setShowModal] = useState(false);
  const buildIdRef = useRef<string>("");

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

      // Re-create the polling interval when the user changes settings
      const onSettings = () => startPolling();
      window.addEventListener("app-settings-changed", onSettings);
      window.addEventListener("storage", onSettings);
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    // Each time a new SW is detected, mint a new build id
    buildIdRef.current = currentBuildId();
    if (!isSnoozed(buildIdRef.current)) setShowModal(true);
  }, [needRefresh]);

  if (!showModal) return null;

  const handleUpdate = async () => {
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
    setShowModal(false);
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

  return (
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
            A new version of the app is ready. Update now to get the latest features
            and fixes.
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
  );
};

export default PWAUpdatePrompt;
