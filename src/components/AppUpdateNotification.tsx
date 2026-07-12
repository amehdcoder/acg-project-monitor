import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, X, Loader2, Link2, WifiOff, ShieldCheck } from "lucide-react";

interface ReleaseHighlight {
  icon: typeof Link2;
  title: string;
  body: string;
}

const RELEASE_HIGHLIGHTS: ReleaseHighlight[] = [
  {
    icon: Link2,
    title: "Linked Workflows",
    body: "The Checklist now flows directly into the Repeat Household Coverage Survey with a single unified submit action.",
  },
  {
    icon: WifiOff,
    title: "Enterprise Offline-First Engine",
    body: "Modeled after CommCare/KoboCollect with strict idempotency and reference data caching so your work is safe even in 0% network coverage.",
  },
  {
    icon: ShieldCheck,
    title: "Performance & Stability",
    body: "Resolved initialization delays (endless spinners), fixed random blank screens with error boundaries, and hardened session auto-refreshes against network blips.",
  },
];

interface AppUpdateNotificationProps {
  open: boolean;
  isUpdating: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  onDismissBanner: () => void;
}

/**
 * Professional, brand-aligned "New Update Available" experience.
 * Renders a slim top banner plus a rich changelog modal so field users
 * understand the value of the new deployment before refreshing.
 */
const AppUpdateNotification = ({
  open,
  isUpdating,
  onUpdate,
  onDismiss,
  onDismissBanner,
}: AppUpdateNotificationProps) => {
  return (
    <>
      {/* Slim top banner — always visible when an update is pending */}
      <div
        className="fixed inset-x-0 top-0 z-[10000] flex items-center justify-center gap-3 border-b-2 border-primary bg-gradient-to-r from-primary/95 via-primary to-primary/95 px-4 py-2 text-primary-foreground shadow-lg animate-in slide-in-from-top duration-300"
        role="status"
        aria-live="polite"
      >
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="text-sm font-semibold">A new update is available for Amehnities</span>
        <Button
          onClick={onUpdate}
          variant="gold"
          size="sm"
          disabled={isUpdating}
          className="h-7 px-3 text-xs font-bold"
        >
          {isUpdating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          {isUpdating ? "Updating…" : "Update Now"}
        </Button>
        <button
          onClick={onDismissBanner}
          className="ml-1 rounded-full p-1 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          aria-label="Hide update banner"
          title="Hide this banner; it will reappear only when a newer version ships"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Rich changelog modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-update-title"
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border-2 border-primary bg-card shadow-2xl ring-4 ring-primary/20 animate-in zoom-in-95">
            <button
              onClick={onDismiss}
              className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              aria-label="Dismiss update"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="bg-gradient-to-br from-primary via-primary to-emerald-600 px-6 py-6 text-primary-foreground">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/30">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h2 id="app-update-title" className="text-xl font-bold leading-tight">
                    A new update is available for Amehnities!
                  </h2>
                  <p className="mt-1 text-sm text-primary-foreground/90">
                    We’ve optimized your workspace to make field data collection smoother and more reliable.
                  </p>
                </div>
              </div>
            </div>

            {/* Body — release highlights */}
            <div className="max-h-[50vh] overflow-y-auto px-6 py-5">
              <ul className="space-y-4">
                {RELEASE_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer — CTA */}
            <div className="border-t border-border bg-muted/30 px-6 py-4">
              <Button
                onClick={onUpdate}
                variant="acg"
                size="lg"
                disabled={isUpdating}
                className="w-full text-base font-semibold"
              >
                {isUpdating ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-5 w-5" />
                )}
                {isUpdating ? "Refreshing Workspace…" : "Update & Refresh Workspace"}
              </Button>
              <button
                onClick={onDismiss}
                className="mt-3 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Remind me later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AppUpdateNotification;
