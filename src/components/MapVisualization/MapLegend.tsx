import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapMarker } from "./types";
import { useMemo, useState } from "react";
import { Shield, Eye, EyeOff, ChevronDown, ChevronUp, List } from "lucide-react";

interface GeofenceBoundary {
  name: string;
  coordinates: [number, number][];
  color?: string;
}

interface MapLegendProps {
  markers: MapMarker[];
  showLegend: boolean;
  geofences?: GeofenceBoundary[];
  showGeofences?: boolean;
  onToggleGeofences?: () => void;
  onGeofenceClick?: (index: number) => void;
}

const MapLegend = ({ markers, showLegend, geofences = [], showGeofences = true, onToggleGeofences, onGeofenceClick }: MapLegendProps) => {
  const [open, setOpen] = useState(true);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    markers.forEach((m) => {
      const state = m.state || "Unknown";
      counts[state] = (counts[state] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [markers]);

  if (!showLegend || (markers.length === 0 && geofences.length === 0)) return null;

  // Collapsed: a compact pill button that re-opens the legend.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 z-[1000] flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-2 shadow-lg ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-muted"
        title="Show legend"
      >
        <List className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Legend</span>
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <Card className="absolute bottom-4 left-4 z-[1000] w-60 shadow-lg bg-background/95 backdrop-blur-sm">
      {/* Collapse header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Map Legend
        </span>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-muted/60 transition-colors"
          title="Hide legend"
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Geofence Boundaries Section */}
      {geofences.length > 0 && (
        <>
          <CardHeader className="py-2 px-3 pb-1 border-t border-border pt-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-destructive" />
                Geofence Boundaries
              </span>
              {onToggleGeofences && (
                <button
                  onClick={onToggleGeofences}
                  className="p-1 rounded hover:bg-muted/60 transition-colors"
                  title={showGeofences ? "Hide boundaries" : "Show boundaries"}
                >
                  {showGeofences ? (
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1.5 px-3 pt-0">
            <div className="space-y-1.5">
              {geofences.map((gf, idx) => (
                <button
                  key={idx}
                  onClick={() => onGeofenceClick?.(idx)}
                  className="flex items-center gap-2 text-sm w-full rounded px-1 py-0.5 hover:bg-muted/60 transition-colors cursor-pointer text-left"
                  title={`Zoom to ${gf.name}`}
                >
                  <span
                    className="h-3 w-5 shrink-0 rounded-sm border"
                    style={{
                      borderColor: gf.color || "#e11d48",
                      backgroundColor: `${gf.color || "#e11d48"}18`,
                      borderStyle: "dashed",
                      borderWidth: "1.5px",
                    }}
                  />
                  <span className="truncate text-muted-foreground text-xs">
                    {gf.name}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </>
      )}

      {/* Submissions by State Section */}
      {stateCounts.length > 0 && (
        <>
          <CardHeader className={`py-2 px-3 pb-1 ${geofences.length > 0 ? "border-t border-border pt-2" : "border-t border-border pt-2"}`}>
            <CardTitle className="text-sm font-medium">Submissions by State</CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3 pt-0 max-h-[220px] overflow-y-auto">
            <div className="space-y-1.5">
              {stateCounts.map(([state, count]) => (
                <div key={state} className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground">{state}</span>
                  <Badge variant="secondary" className="text-xs min-w-[32px] justify-center">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
            {stateCounts.length === 10 && markers.length > 10 && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing top 10 states
              </p>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
};

export default MapLegend;
