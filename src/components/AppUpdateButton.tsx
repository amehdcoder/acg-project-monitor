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
    await checkForAppUpdate({ force: true, source: shouldSkipServiceWorker ? "html" : "version" });
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
      className="h-8 shrink-0 px-2.5 text-xs font-bold shadow-glow sm:px-3"
      aria-label={hasUpdate ? "A new version is available — tap to update" : stamp}
      title={hasUpdate ? "A new version is available — tap to update" : stamp}
    >
      {hasUpdate ? (
        <Sparkles className="h-4 w-4" />
      ) : isBusy ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {hasUpdate ? "Update now" : stamp}
      </span>
      <span className="sm:hidden">{hasUpdate ? "Update" : "v"}</span>
    </Button>
  );
};

export default AppUpdateButton;
