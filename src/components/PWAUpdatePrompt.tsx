import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
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
} from "@/lib/appUpdateManager";
import { hasActiveUserFormProgress } from "@/lib/formProgressPersistence";

interface InnerProps {
  onAvailable: () => void;
  registerSelf: (fn: (signal: AbortSignal) => Promise<void>) => void;
}

const SwRegistrar = ({ onAvailable, registerSelf }: InnerProps) => {
  const removeFocusListener = useRef<(() => void) | null>(null);
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    // The manager owns the only navigation; Workbox must not reload too.
    onNeedReload() {},
    onRegisteredSW(_swUrl, registration) {
      if (!registration || signal.aborted) return;
      removeFocusListener.current?.();
      const onFocus = () => registration.update().catch(() => {});
      window.addEventListener("focus", onFocus);
      removeFocusListener.current = () => window.removeEventListener("focus", onFocus);
      registration.update().catch(() => {});
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    registerSelf(async (signal) => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      await registration.update();
      if(signal.aborted)return;
      // A worker may still be downloading its revisioned offline shell.
      const worker = registration.waiting || registration.installing;
      if (!worker) return;
      if (worker.state === "installing") {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { cleanup(); reject(new Error("The update download timed out. Please retry.")); }, 8000);
          const cleanup = () => { clearTimeout(timer); worker.removeEventListener("statechange", check); signal.removeEventListener("abort",cancel); };
          const check = () => {
            if (worker.state === "installed") { cleanup(); resolve(); }
            if (worker.state === "redundant") { cleanup(); reject(new Error("The update download failed. Please retry.")); }
          };
          const cancel=()=>{cleanup();reject(new Error("Update cancelled. Please retry."));};
          signal.addEventListener("abort",cancel,{once:true});
          worker.addEventListener("statechange", check);
          check();
        });
      }
      if (signal.aborted || worker.state === "activated") return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error("The update activation timed out. Please retry.")); }, 3000);
        const cleanup = () => { clearTimeout(timer); worker.removeEventListener("statechange", check); signal.removeEventListener("abort",cancel); };
        const check = () => {
          if (worker.state === "activated") { cleanup(); resolve(); }
          if (worker.state === "redundant") { cleanup(); reject(new Error("The update couldn't activate. Please retry.")); }
        };
        const cancel=()=>{cleanup();reject(new Error("Update cancelled. Please retry."));};
        signal.addEventListener("abort",cancel,{once:true});
        worker.addEventListener("statechange", check);
        if(signal.aborted){cancel();return;}
        worker.postMessage({ type: "SKIP_WAITING" });
        check();
      });
    });
  }, [registerSelf]);

  useEffect(() => () => removeFocusListener.current?.(), []);

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

  useEffect(() => {
    if (!shouldSkipServiceWorker || !navigator.serviceWorker) return;
    void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.filter(r => [r.active, r.waiting, r.installing].some(w => w && new URL(w.scriptURL).pathname === '/sw.js')).map(r => r.unregister())));
  }, []);
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

  const handleAvailable = useCallback(() => markServiceWorkerUpdateAvailable(), []);

  const handleUpdate = async () => {
    if (isUpdating || getAppUpdateState().status === "updating") return;
    setIsUpdating(true);
    try {
      const applied = await hardReloadToLatest();
      if (!applied) toast.error(getAppUpdateState().error || "Couldn't update. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSnooze = () => {
    import("@/lib/appUpdateManager").then(({ snoozeCurrentUpdate }) => snoozeCurrentUpdate());
    setShowModal(false);
  };

  const registerSelf = useCallback((fn: (signal: AbortSignal) => Promise<void>) => registerServiceWorkerUpdater(fn), []);

  return (
    <>
      {!shouldSkipServiceWorker && <SwRegistrar onAvailable={handleAvailable} registerSelf={registerSelf} />}

      {updateState.updateAvailable && !activeFormProgress && dismissedBuild !== updateState.latestBuildId && (
        <AppUpdateNotification
          error={updateState.error}
          open={showModal}
          isUpdating={isUpdating || updateState.status === "updating"}
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
