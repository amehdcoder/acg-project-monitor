import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from 'react-dom';
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import AppUpdateNotification from "@/components/AppUpdateNotification";
import {
  hardReloadToLatest,
  markServiceWorkerUpdateAvailable,
  registerServiceWorkerUpdater,
  shouldSkipServiceWorker,
  startAppUpdatePolling,
  subscribeToAppUpdates,
  getAppUpdateState,
} from "@/lib/appUpdateManager";
import { hasActiveUserFormProgress } from "@/lib/formProgressPersistence";
import { activateAppWorker } from '@/lib/serviceWorkerUpdate';

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
      if (!registration) return;
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
      if (!registration || signal.aborted) return;
      await activateAppWorker(registration, signal);
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeFormProgress, setActiveFormProgress] = useState(false);
  // Build id the user explicitly dismissed the top banner for. The banner stays
  // hidden for that build; a genuinely NEW build resets it and shows again.
  const [dismissedBuild, setDismissedBuild] = useState("");

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

  const handleAvailable = useCallback(() => markServiceWorkerUpdateAvailable(), []);

  const handleUpdate = async () => {
    if (isUpdating || getAppUpdateState().status === "updating") return;
    flushSync(() => setIsUpdating(true));
    try {
      const applied = await hardReloadToLatest();
      if (!applied) toast.error(getAppUpdateState().error || "Couldn't update. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const registerSelf = useCallback((fn: (signal: AbortSignal) => Promise<void>) => registerServiceWorkerUpdater(fn), []);

  return (
    <>
      {!shouldSkipServiceWorker && <SwRegistrar onAvailable={handleAvailable} registerSelf={registerSelf} />}

      {updateState.updateAvailable && !activeFormProgress && dismissedBuild !== updateState.latestBuildId && (
        <AppUpdateNotification
          error={updateState.error}
          isUpdating={isUpdating || updateState.status === "updating"}
          onUpdate={handleUpdate}
          onDismissBanner={() => {
            setDismissedBuild(updateState.latestBuildId);
          }}
        />
      )}
    </>
  );
};

export default PWAUpdatePrompt;
