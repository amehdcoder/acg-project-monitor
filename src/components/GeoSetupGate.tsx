/**
 * GeoSetupGate
 * ────────────────────────────────────────────────────────────────────────
 * One-time offline workspace initialization gate.
 *
 * The very FIRST time a user logs in on a device, we download the complete
 * 5-tier geography hierarchy (State → LGA → Ward → FLHF → Community) as static
 * JSON shards and seed them into IndexedDB. This offloads 100% of the read
 * pressure to static file hosting, so hundreds of concurrent logins never touch
 * the database — eliminating the high-concurrency bottleneck.
 *
 * While that one-time seed runs we block the dashboard transition with a
 * branded "Preparing your offline workspace…" screen. Once the data is written
 * (stamped via `geo_seeded_version` in localStorage) this gate is transparent
 * on every subsequent login — it renders its children immediately.
 *
 * Resilience: if the device is offline or a shard fails during the first login,
 * we do NOT strand the user. We surface a short notice and let them continue;
 * the cascade will lazily hydrate the missing shards from the network/SW cache
 * on demand, and the seed re-runs on the next successful login.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";
import { isGeoFullySeeded, seedFullGeography } from "@/lib/geographyCache";

interface Props {
  children: React.ReactNode;
}

type Phase = "checking" | "seeding" | "ready" | "error";

const GeoSetupGate = ({ children }: Props) => {
  const [phase, setPhase] = useState<Phase>(() => (isGeoFullySeeded() ? "ready" : "checking"));
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const started = useRef(false);

  useEffect(() => {
    if (phase === "ready") return;
    if (started.current) return;
    started.current = true;

    // Offline on first login → can't download the static assets. Let the user
    // through; the cascade hydrates on demand once connectivity returns.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setPhase("error");
      return;
    }

    setPhase("seeding");
    seedFullGeography((done, total) => setProgress({ done, total }))
      .then(() => setPhase("ready"))
      .catch(() => setPhase("error"));
  }, [phase]);

  if (phase === "ready") return <>{children}</>;

  // Failure / offline fallback — never strand the user behind the gate.
  if (phase === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <WifiOff className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="font-display text-lg font-semibold text-foreground">
            Offline workspace not fully prepared
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn't finish downloading the offline geography data. You can keep working —
            location lists will finish loading automatically once you're back online.
          </p>
          <button
            onClick={() => setPhase("ready")}
            className="mt-5 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6"
      role="status"
      aria-live="polite"
      aria-label="Preparing your offline workspace"
    >
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto mb-6 h-14 w-14">
          <div className="absolute inset-0 rounded-2xl bg-primary/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        </div>
        <p className="font-display text-base font-semibold text-foreground">
          Preparing your offline workspace…
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Downloading the full location hierarchy so forms work instantly offline. This happens only
          once.
        </p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(pct, 6)}%` }}
          />
        </div>
        {progress.total > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {progress.done} / {progress.total} regions ready
          </p>
        )}
      </div>
    </div>
  );
};

export default GeoSetupGate;
