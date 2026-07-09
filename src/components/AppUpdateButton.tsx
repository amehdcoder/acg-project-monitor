import { useEffect, useState } from "react";
import { RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkForAppUpdate,
  getAppUpdateState,
  getLastAppliedAt,
  hardReloadToLatest,
  shouldSkipServiceWorker,
  subscribeToAppUpdates,
} from "@/lib/appUpdateManager";

const formatRelative = (ts: number | null): string => {
  if (!ts) return "Up to date";
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `Updated ${date}, ${time}`;
};

const AppUpdateButton = () => {
  const [updateState, setUpdateState] = useState(getAppUpdateState());
  const [appliedAt, setAppliedAt] = useState<number | null>(getLastAppliedAt());
  const [installing, setInstalling] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => subscribeToAppUpdates(() => {
    setUpdateState(getAppUpdateState());
    setAppliedAt(getLastAppliedAt());
  }), []);

  // Re-render every 60s so the relative time stays fresh.
  useEffect(() => {
    const id = setInterval(() => setAppliedAt(getLastAppliedAt()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Belt-and-braces: make sure no stale service worker can keep serving the
  // old shell, even if hardReloadToLatest's own cleanup was interrupted.
  const purgeServiceWorkers = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map((r) => r.unregister()));
    } catch { /* best-effort */ }
  };

  const handleClick = async () => {
    if (installing) return;
    // Single click = guaranteed install. Show feedback instantly so the control
    // never feels frozen, then run the real update with a hard watchdog so a
    // hung cache/probe can never leave the user stuck.
    setInstalling(true);
    setStatusText("Checking…");

    // Watchdog: no matter what happens below (probe hang, cache API stall,
    // service-worker timeout), unregister any stale worker and force a
    // cache-busted hard reload after 6s so the update ALWAYS completes.
    const watchdog = setTimeout(() => {
      void purgeServiceWorkers().finally(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("__v", String(Date.now()));
          window.location.replace(url.toString());
        } catch {
          window.location.reload();
        }
      });
    }, 6000);

    // Retry the version probe a few times — transient network blips should never
    // make a single click feel like it "did nothing". The watchdog still
    // guarantees completion regardless of probe outcome.
    const probeWithRetry = async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        setStatusText(attempt === 1 ? "Checking…" : `Retrying (${attempt})…`);
        try {
          await Promise.race([
            checkForAppUpdate({ force: true, source: shouldSkipServiceWorker ? "html" : "version" }),
            new Promise((_r, rej) => setTimeout(() => rej(new Error("probe-timeout")), 2000)),
          ]);
          return; // success
        } catch {
          if (attempt < 3) await new Promise((r) => setTimeout(r, 300));
        }
      }
    };

    try {
      await probeWithRetry();
      setStatusText("Applying…");
      await purgeServiceWorkers();
      await hardReloadToLatest();
    } catch {
      // even if everything failed, the watchdog reload will recover.
      setStatusText("Finishing…");
    }
    // Note: we intentionally do NOT clear the watchdog — hardReloadToLatest
    // navigates away on success; if it didn't, the watchdog guarantees a reload.
    void watchdog;
  };

  const isBusy = installing || updateState.status === "checking" || updateState.status === "updating";
  const hasUpdate = updateState.updateAvailable;
  const stamp = formatRelative(appliedAt);
  const busyLabel = statusText || "Updating…";

  if (!hasUpdate && !installing) return null;

  return (
    <Button
      type="button"
      variant={hasUpdate ? "gold" : "acg"}
      size="sm"
      onClick={handleClick}
      disabled={isBusy}
      className="h-8 shrink-0 gap-1 px-2 text-xs font-bold shadow-glow whitespace-nowrap sm:px-3"
      aria-label={hasUpdate ? "A new version is available — tap to update" : stamp}
      title={hasUpdate ? "A new version is available — tap to update" : stamp}
    >
      {hasUpdate ? (
        <Sparkles className="h-4 w-4 shrink-0" />
      ) : isBusy ? (
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      )}
      {/* Always render a readable label so the control is fully visible on
          every Android width — no cryptic single-letter fallback. */}
      <span className="hidden sm:inline">
        {isBusy ? busyLabel : hasUpdate ? "Update now" : stamp}
      </span>
      <span className="sm:hidden">{isBusy ? "…" : hasUpdate ? "Update" : "Latest"}</span>
    </Button>
  );
};

export default AppUpdateButton;
