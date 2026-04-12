import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Route } from "lucide-react";
import type { RouteOption } from "./types";

interface Props {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const trafficColor: Record<string, string> = {
  low: "text-green-600",
  moderate: "text-yellow-600",
  heavy: "text-orange-600",
  severe: "text-red-600",
};

const RouteOptionsPanel = ({ routes, selectedId, onSelect }: Props) => {
  if (routes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />Route Options
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {routes.map(r => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`w-full text-left p-2 rounded-md border text-sm transition-all ${
              r.id === selectedId
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.label}</span>
              <Badge variant="secondary" className="text-xs">{r.duration}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{r.distance}</span>
              <span className={`capitalize ${trafficColor[r.trafficLevel]}`}>
                ● {r.trafficLevel} traffic
              </span>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
};

export default RouteOptionsPanel;
