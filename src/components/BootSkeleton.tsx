/**
 * BootSkeleton
 *
 * A lightweight, branded loader shown while the offline-first boot lifecycle
 * resolves the cached auth session and decides where to route the user
 * (sign-in page vs. the app shell). Rendering an instant, styled shell — rather
 * than a bare spinner or an empty <div> — guarantees the transition from the
 * service-worker-cached index.html to the correct route is smooth and never
 * flashes a blank white screen, even when launched with zero network.
 */
const BootSkeleton = () => (
  <div
    className="flex min-h-screen flex-col items-center justify-center bg-background px-6"
    role="status"
    aria-live="polite"
    aria-label="Loading Amehnities"
  >
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-2xl bg-primary/10" />
        <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
        </div>
      </div>
      <div className="text-center">
        <p className="font-display text-base font-semibold text-foreground">Amehnities</p>
        <p className="mt-1 text-xs text-muted-foreground">Preparing your workspace…</p>
      </div>
    </div>
  </div>
);

export default BootSkeleton;
