/**
 * LocationStatusBadge — small, clean indicator of the current GPS source with a
 * "Refresh GPS" button that re-triggers Tier-1 high-precision acquisition.
 *
 * Purely presentational; safe to render even when no coordinate exists yet.
 */
import { RefreshCw, Satellite, Wifi, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocationSource } from "@/hooks/useInstantLocation";

interface Props {
  source: LocationSource;
  label: string;
  accuracy?: number | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const sourceStyles: Record<LocationSource, string> = {
  high: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  cached: "bg-sky-500/10 text-sky-700 border-sky-300",
  network: "bg-amber-500/10 text-amber-700 border-amber-300",
  fallback: "bg-muted text-muted-foreground border-border",
  none: "bg-muted text-muted-foreground border-border",
};

const SourceIcon = ({ source }: { source: LocationSource }) => {
  switch (source) {
    case "high":
      return <Satellite className="h-3.5 w-3.5" />;
    case "network":
      return <Wifi className="h-3.5 w-3.5" />;
    default:
      return <MapPin className="h-3.5 w-3.5" />;
  }
};

export default function LocationStatusBadge({
  source,
  label,
  accuracy,
  isRefreshing,
  onRefresh,
  className,
}: Props) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          sourceStyles[source],
        )}
      >
        <SourceIcon source={source} />
        {label}
        {accuracy != null && Number.isFinite(accuracy) && (
          <span className="opacity-70">· ±{Math.round(accuracy)}m</span>
        )}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh GPS"
          title="Refresh GPS (high precision)"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
