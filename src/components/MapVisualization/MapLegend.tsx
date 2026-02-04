import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapMarker } from "./types";
import { useMemo } from "react";

interface MapLegendProps {
  markers: MapMarker[];
  showLegend: boolean;
}

const MapLegend = ({ markers, showLegend }: MapLegendProps) => {
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

  if (!showLegend || markers.length === 0) return null;

  return (
    <Card className="absolute bottom-4 left-4 z-[1000] w-56 shadow-lg bg-background/95 backdrop-blur-sm">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm font-medium">Submissions by State</CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-3 pt-0">
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
            Showing top 10 of {Object.keys(stateCounts).length} states
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default MapLegend;
