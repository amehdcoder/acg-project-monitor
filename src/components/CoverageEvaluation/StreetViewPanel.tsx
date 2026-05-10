import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number | null;
  lng: number | null;
  accuracy?: number | null;
}

/**
 * Mapillary street-level imagery embed.
 * Auto re-centers when the user's GPS improves significantly:
 *  - new fix has better accuracy than the current center, OR
 *  - new fix has moved >25 m from the center.
 * The iframe is keyed by the chosen center coordinate so it only re-mounts
 * when the center actually changes (no flicker on every GPS tick).
 */
export default function StreetViewPanel({ open, onOpenChange, lat, lng, accuracy }: Props) {
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  // Stable center that drives the iframe; only updated on real improvements.
  const [center, setCenter] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [recenteredAt, setRecenteredAt] = useState<number | null>(null);
  const recenterMsgTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !hasCoords) return;
    const newAcc = typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : 9999;

    if (!center) {
      setCenter({ lat: lat as number, lng: lng as number, acc: newAcc });
      return;
    }

    // Distance from current center (haversine, meters)
    const R = 6371000;
    const dLat = ((lat as number) - center.lat) * Math.PI / 180;
    const dLng = ((lng as number) - center.lng) * Math.PI / 180;
    const latMid = (((lat as number) + center.lat) / 2) * Math.PI / 180;
    const distM = R * Math.sqrt(dLat * dLat + Math.pow(Math.cos(latMid) * dLng, 2));

    const accuracyImproved = newAcc + 5 <= center.acc; // ≥5m improvement
    const movedFar = distM > 25;

    if (accuracyImproved || movedFar) {
      setCenter({ lat: lat as number, lng: lng as number, acc: newAcc });
      setRecenteredAt(Date.now());
      if (recenterMsgTimer.current) window.clearTimeout(recenterMsgTimer.current);
      recenterMsgTimer.current = window.setTimeout(() => setRecenteredAt(null), 2500);
    }
  }, [open, lat, lng, accuracy, hasCoords, center]);

  useEffect(() => {
    return () => {
      if (recenterMsgTimer.current) window.clearTimeout(recenterMsgTimer.current);
    };
  }, []);

  const src = center
    ? `https://www.mapillary.com/embed?map_style=Mapillary+streets&x=${center.lng}&y=${center.lat}&z=17&style=photo`
    : "";
  const iframeKey = center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : "none";

  const showRecenterMsg = recenteredAt !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Street-level View
          </SheetTitle>
          <SheetDescription className="text-xs">
            Community-contributed street imagery via Mapillary. Pan/zoom to inspect buildings,
            landmarks, and people captured on recent walks.
            {center && (
              <> Centered at {center.lat.toFixed(5)}, {center.lng.toFixed(5)} (±{center.acc.toFixed(0)} m).</>
            )}
            {showRecenterMsg && center && (
              <span className="ml-1 text-primary font-medium">
                Re-centered to ±{center.acc.toFixed(0)} m fix.
              </span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          {center ? (
            <iframe
              key={iframeKey}
              title="Mapillary street view"
              src={src}
              className="w-full h-full border-0"
              allow="geolocation; fullscreen"
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Lock GPS first to view street-level imagery for your location.
            </div>
          )}
        </div>
        {center && (
          <div className="p-3 border-t flex justify-end">
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
              <a
                href={`https://www.mapillary.com/app/?lat=${center.lat}&lng=${center.lng}&z=17`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3" /> Open in Mapillary
              </a>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
