import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X, Loader2 } from "lucide-react";

interface AppUpdateNotificationProps {
  error?: string | null;
  isUpdating: boolean;
  onUpdate: () => void;
  onDismissBanner: () => void;
}

// Never cover the header's Update control or intercept the rest of the app.
const AppUpdateNotification = ({ error, isUpdating, onUpdate, onDismissBanner }: AppUpdateNotificationProps) => (
  <div className="pointer-events-none fixed inset-x-3 bottom-24 z-[10000] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[420px]">
    <div role="status" aria-live="polite" className="pointer-events-auto flex items-start gap-3 rounded-lg border border-primary/30 bg-card p-3 text-card-foreground shadow-lg">
      <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold">New Amehnities version available</p>
        {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}
        <Button onClick={onUpdate} variant="update" size="sm" disabled={isUpdating} aria-busy={isUpdating} className="h-9 min-w-[112px] gap-1.5 text-xs font-semibold">
          {isUpdating ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {isUpdating ? "Updating…" : "Update now"}
        </Button>
      </div>
      <Button variant="ghost" size="icon" onClick={onDismissBanner} aria-label="Hide update banner" title="Hide this notice until a newer version is available" className="h-9 w-9 shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  </div>
);
export default AppUpdateNotification;
