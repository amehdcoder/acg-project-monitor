/**
 * Persistent location header bar shown on every form.
 *
 * Renders: 📍 Location: Ward, LGA  |  ±xm
 * Tap to expand → full admin chain + lat/lng + altitude + accuracy.
 * Shows an amber warning if accuracy > 30m.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin, ChevronDown, ChevronUp, AlertTriangle, Sparkles } from "lucide-react";
import {
  ACCURACY_GOOD_THRESHOLD,
  type AutoGpsFix,
} from "@/hooks/useLocationEnforcement";
import {
  formatHeaderLabel,
  type ReverseGeocodeResult,
} from "@/lib/locationEnforcement/reverseGeocoder";

interface LocationHeaderBarProps {
  fix: AutoGpsFix | null;
  resolved: ReverseGeocodeResult | null;
  source: "auto_gps" | "gps_question";
}

const LocationHeaderBar = ({ fix, resolved, source }: LocationHeaderBarProps) => {
  const [open, setOpen] = useState(false);
  const accuracy = fix?.accuracy ?? null;
  const lowAccuracy = accuracy !== null && accuracy > ACCURACY_GOOD_THRESHOLD;
  const label = formatHeaderLabel(resolved);

  return (
    <div
      className={`border-b ${
        lowAccuracy ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/30"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className={`h-4 w-4 shrink-0 ${lowAccuracy ? "text-amber-600" : "text-primary"}`} />
          <span className="text-xs font-medium truncate">📍 {label}</span>
          {accuracy !== null && (
            <Badge
              variant={lowAccuracy ? "outline" : "secondary"}
              className={`text-[10px] h-5 px-1.5 ${
                lowAccuracy ? "border-amber-500/50 text-amber-700" : ""
              }`}
            >
              ±{Math.round(accuracy)}m
            </Badge>
          )}
          {lowAccuracy && (
            <span className="text-[10px] text-amber-700 hidden sm:inline">
              <AlertTriangle className="h-3 w-3 inline mr-0.5" /> Move to open area for better fix
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 hidden md:inline-flex">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            {source === "gps_question" ? "From GPS question" : "Auto-detected"}
          </Badge>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">State</p>
            <p className="font-medium">{resolved?.state || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">LGA</p>
            <p className="font-medium">{resolved?.lga || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ward</p>
            <p className="font-medium">{resolved?.ward || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Settlement</p>
            <p className="font-medium truncate" title={resolved?.settlement || undefined}>
              {resolved?.settlement || "—"}
            </p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <p className="text-muted-foreground">Latitude</p>
            <p className="font-mono">{fix ? fix.lat.toFixed(6) : "—"}</p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <p className="text-muted-foreground">Longitude</p>
            <p className="font-mono">{fix ? fix.lng.toFixed(6) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Altitude</p>
            <p className="font-mono">{fix?.altitude != null ? `${Math.round(fix.altitude)}m` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Accuracy</p>
            <p className={`font-mono ${lowAccuracy ? "text-amber-700 font-semibold" : ""}`}>
              ±{accuracy != null ? Math.round(accuracy) : "—"}m
            </p>
          </div>
          {resolved?.source && (
            <div className="col-span-2 md:col-span-4 text-[10px] text-muted-foreground italic" title="Auto-detected from GPS">
              Admin chain resolved from {source === "gps_question" ? "GPS question coordinate" : "device GPS"} via offline reverse-geocoder ({resolved.source}).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationHeaderBar;
