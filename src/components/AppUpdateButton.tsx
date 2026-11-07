import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  checkForAppUpdate,
  getAppUpdateState,
  getLastAppliedAt,
  hardReloadToLatest,
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

  const clickInFlight = useRef(false);
  const handleClick = async () => {
    if (clickInFlight.current || getAppUpdateState().status === "updating") return;
    clickInFlight.current = true;
    setInstalling(true);
    setStatusText("Checking…");
    const toastId = toast.loading("Checking for updates…");
    try {
      const next = await checkForAppUpdate({ force: true });
      if (next.status === "error") throw new Error(next.error || "Couldn't check for updates. Please try again.");
      if (!next.updateAvailable) {
        setStatusText("Up to date");
        toast.success("You're on the latest version", { id: toastId });
        return;
      }
      setStatusText("Updating…");
      toast.loading("Applying update…", { id: toastId });
      const applied = await hardReloadToLatest();
      if (!applied) throw new Error(getAppUpdateState().error || "Couldn't update. Please try again.");
      toast.dismiss(toastId);
    } catch (error) {
      setStatusText("Retry update");
      toast.error(error instanceof Error ? error.message : "Couldn't update. Please try again.", { id: toastId });
    } finally {
      clickInFlight.current = false;
      setInstalling(false);
    }
  };

  const isBusy = installing || updateState.status === "updating";
  const hasUpdate = updateState.updateAvailable;
  const stamp = formatRelative(appliedAt);
  const busyLabel = statusText || (hasUpdate ? "Updating…" : "Checking…");

  return (
    <Button
      type="button"
      variant="update"
      size="sm"
      onClick={handleClick}
      disabled={isBusy}
      aria-busy={isBusy}
      className={`h-9 min-w-[84px] shrink-0 gap-1.5 px-2.5 text-xs font-bold shadow-glow whitespace-nowrap sm:h-8 sm:min-w-[92px] sm:px-3 ${
        hasUpdate ? "ring-2 ring-primary/40" : "ring-1 ring-primary/25"
      }`}
      aria-label={hasUpdate ? "A new version is available — tap to update" : `Check for updates. ${stamp}`}
      title={hasUpdate ? "A new version is available — tap to update" : `Check for updates. ${stamp}`}
    >
      {isBusy ? (
        <RefreshCw className="h-4 w-4 shrink-0 motion-safe:animate-spin" />
      ) : hasUpdate ? (
        <Sparkles className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      )}
      {/* Always render a readable label so the control is fully visible on
          every screen width — including small Android and iPhone widths. */}
      <span>
        {isBusy ? busyLabel : statusText || "Update"}
      </span>
    </Button>
  );
};


export default AppUpdateButton;
