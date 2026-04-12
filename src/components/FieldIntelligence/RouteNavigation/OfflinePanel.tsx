import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Trash2, WifiOff } from "lucide-react";
import type { CachedMapRegion } from "./types";

interface Props {
  cachedRegions: CachedMapRegion[];
  caching: boolean;
  cacheProgress: number;
  onCacheCurrentView: () => void;
  onRemove: (id: string) => void;
  onLoad: () => void;
}

const OfflinePanel = ({ cachedRegions, caching, cacheProgress, onCacheCurrentView, onRemove, onLoad }: Props) => {
  useEffect(() => { onLoad(); }, [onLoad]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-primary" />Offline Maps
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={onCacheCurrentView} disabled={caching} size="sm" variant="outline" className="w-full gap-2">
          <Download className="h-3 w-3" />
          {caching ? "Caching..." : "Cache Current View"}
        </Button>
        {caching && <Progress value={cacheProgress} className="h-2" />}
        {cachedRegions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">SAVED REGIONS</p>
            {cachedRegions.map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <div>
                  <span>{r.tileCount} tiles</span>
                  <span className="text-muted-foreground ml-1">
                    {new Date(r.cachedAt).toLocaleDateString()}
                  </span>
                </div>
                <Button onClick={() => onRemove(r.id)} size="sm" variant="ghost" className="h-6 w-6 p-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {cachedRegions.length === 0 && !caching && (
          <p className="text-xs text-muted-foreground">No regions cached yet. Zoom to an area and cache it for offline use.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default OfflinePanel;
