import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import AppUpdateNotification from "@/components/AppUpdateNotification";
import {
  hardReloadToLatest,
  isSnoozed,
  markServiceWorkerUpdateAvailable,
  registerServiceWorkerUpdater,
  shouldSkipServiceWorker,
  startAppUpdatePolling,
  subscribeToAppUpdates,
  getAppUpdateState,
  
  APPLIED_BUILD_AT_KEY,
  APPLIED_BUILD_ID_KEY,
} from "@/lib/appUpdateManager";
import { hasActiveUserFormProgress, prepareSilentFormRestoreForUpdate } from "@/lib/formProgressPersistence";

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
  const [activeFormProgress, setActiveFormProgress] = useState(false);
  // Build id the user explicitly dismissed the top banner for. The banner stays
  // hidden for that build; a genuinely NEW build resets it and shows again.
  const [dismissedBuild, setDismissedBuild] = useState("");
  const lastPromptedBuildRef = useRef("");

  useEffect(() => subscribeToAppUpdates(() => setUpdateState(getAppUpdateState())), []);
  useEffect(() => startAppUpdatePolling(), []);
  useEffect(() => {
    const refresh = () => setActiveFormProgress(hasActiveUserFormProgress());
    refresh();
    const id = setInterval(refresh, 3000);
    window.addEventListener("storage", refresh);
    window.addEventListener("amehnities:form-progress-changed", refresh);
    window.addEventListener("amehnities:before-silent-update", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("amehnities:form-progress-changed", refresh);
      window.removeEventListener("amehnities:before-silent-update", refresh);
    };
  }, []);

  useEffect(() => {
    if (!updateState.updateAvailable) return;
    if (lastPromptedBuildRef.current === updateState.latestBuildId) return;
    lastPromptedBuildRef.current = updateState.latestBuildId;

    const latestId = updateState.latestBuildId;

    if (hasActiveUserFormProgress()) {
      setShowModal(false);
      return;
    }

    // IMPORTANT: never auto-reload. A published build must only be applied when
    // the user explicitly taps "Update now". Auto-apply was intermittently
    // refreshing users' apps on publish and destroying in-progress work. Here we
    // only surface the (non-intrusive) update banner/modal; the actual reload is
    // triggered exclusively by handleUpdate() from a user click.
    if (!isSnoozed(latestId)) setShowModal(true);

  }, [updateState.latestBuildId, updateState.updateAvailable]);

  const handleAvailable = () => markServiceWorkerUpdateAvailable();

  const handleUpdate = async () => {
    setIsUpdating(true);
    // Immediately skip the waiting service worker so the newest build takes
    // control before we reload — this flash-mounts the latest shell instantly.
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
    } catch { /* best-effort */ }
    // Watchdog: guarantee the update completes from a single click even if the
    // cache purge / service-worker swap hangs. After 6s force a cache-busted reload.
    const watchdog = setTimeout(() => {
      try {
        if (navigator.onLine === false) return;
        const url = new URL(window.location.href);
        url.searchParams.set("__v", String(Date.now()));
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }, 6000);
    // Give UI a moment to show the spinner before the hard reload starts clearing caches
    await new Promise(r => setTimeout(r, 80));
    try {
      await hardReloadToLatest();
    } catch (err) {
      console.error("Update failed", err);
      // Let the watchdog recover instead of leaving the user stuck.
    } finally {
      // Do not clear the watchdog. A successful hard reload navigates away;
      // if navigation is blocked by a stale service worker race, the watchdog
      // guarantees one final cache-busted reload instead of a dead button.
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

      {updateState.updateAvailable && !activeFormProgress && dismissedBuild !== updateState.latestBuildId && (
        <AppUpdateNotification
          open={showModal}
          isUpdating={isUpdating}
          onUpdate={handleUpdate}
          onDismiss={handleSnooze}
          onDismissBanner={() => {
            setShowModal(false);
            setDismissedBuild(updateState.latestBuildId);
          }}
        />
      )}
    </>
  );
};

export default PWAUpdatePrompt;
