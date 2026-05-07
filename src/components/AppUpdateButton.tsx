import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkForAppUpdate,
  getAppUpdateState,
  hardReloadToLatest,
  shouldSkipServiceWorker,
  subscribeToAppUpdates,
} from "@/lib/appUpdateManager";

const AppUpdateButton = () => {
  const [updateState, setUpdateState] = useState(getAppUpdateState());

  useEffect(() => subscribeToAppUpdates(() => setUpdateState(getAppUpdateState())), []);

  const handleClick = async () => {
    await checkForAppUpdate({ force: true, source: shouldSkipServiceWorker ? "html" : "version" });
    await hardReloadToLatest();
  };

  const isBusy = updateState.status === "checking" || updateState.status === "updating";
  const hasUpdate = updateState.updateAvailable;

  return (
    <Button
      type="button"
      variant={hasUpdate ? "gold" : "acg"}
      size="sm"
      onClick={handleClick}
      disabled={isBusy}
      className="h-8 shrink-0 px-2.5 text-xs font-bold shadow-glow sm:px-3"
      aria-label="Update app to the latest published version"
      title="Update app to the latest published version"
    >
      {hasUpdate ? (
        <Sparkles className="h-4 w-4 animate-pulse" />
      ) : (
        <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
      )}
      <span className="hidden sm:inline">{hasUpdate ? "Update now" : "Update"}</span>
      <span className="sm:hidden">Update</span>
    </Button>
  );
};

export default AppUpdateButton;