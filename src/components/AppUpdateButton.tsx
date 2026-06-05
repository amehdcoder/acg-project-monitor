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

  useEffect(() => subscribeToAppUpdates(() => {
    setUpdateState(getAppUpdateState());
    setAppliedAt(getLastAppliedAt());
  }), []);

  // Re-render every 60s so the relative time stays fresh.
  useEffect(() => {
    const id = setInterval(() => setAppliedAt(getLastAppliedAt()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleClick = async () => {
    // Guarantee a REAL update — never a fake one:
    // 1. Force a fresh version probe (no-store) so we know the true latest build.
    // 2. Clear caches + unregister service workers + cache-busted hard reload.
    // hardReloadToLatest does the destructive work, so the next boot always
    // serves the newest assets from the network.
    try {
      await checkForAppUpdate({ force: true, source: shouldSkipServiceWorker ? "html" : "version" });
    } catch {
      /* even if the probe fails we still hard-reload to recover */
    }
    await hardReloadToLatest();
  };

  const isBusy = updateState.status === "checking" || updateState.status === "updating";
  const hasUpdate = updateState.updateAvailable;
  const stamp = formatRelative(appliedAt);

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
        {hasUpdate ? "Update now" : isBusy ? "Updating…" : stamp}
      </span>
      <span className="sm:hidden">{hasUpdate ? "Update" : isBusy ? "…" : "Latest"}</span>
    </Button>
  );
};

export default AppUpdateButton;
