import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Eye, ExternalLink, Loader2, MapPinned, AlertTriangle, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number | null;
  lng: number | null;
  accuracy?: number | null;
}

/**
 * Mapillary street-level imagery embed with smart loading & fallback states.
 *
 * Because the Mapillary embed is a cross-origin iframe, we cannot directly
 * inspect whether imagery exists at the requested point. We instead:
 *  • show a loading spinner until the iframe `load` event fires,
 *  • start a watchdog timer; if the embed has not loaded within a grace period
 *    we surface a "coverage may be sparse here" notice (without removing the
 *    iframe, in case it is merely slow), and
 *  • always offer clear fallbacks: open the exact point in Mapillary, or jump to
 *    Google Maps Street View / satellite imagery for the same coordinate.
 *
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

  // Loading / fallback state for the embed.
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const watchdogTimer = useRef<number | null>(null);

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

  // Reset center when the panel closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setCenter(null);
      setLoading(true);
      setSlow(false);
    }
  }, [open]);

  // (Re)start loading + watchdog whenever the embed center changes.
  useEffect(() => {
    if (!center) return;
    setLoading(true);
    setSlow(false);
    if (watchdogTimer.current) window.clearTimeout(watchdogTimer.current);
    watchdogTimer.current = window.setTimeout(() => setSlow(true), 9000);
    return () => {
      if (watchdogTimer.current) window.clearTimeout(watchdogTimer.current);
    };
  }, [center?.lat, center?.lng]);

  useEffect(() => {
    return () => {
      if (recenterMsgTimer.current) window.clearTimeout(recenterMsgTimer.current);
      if (watchdogTimer.current) window.clearTimeout(watchdogTimer.current);
    };
  }, []);

  const handleIframeLoad = () => {
    setLoading(false);
    setSlow(false);
    if (watchdogTimer.current) window.clearTimeout(watchdogTimer.current);
  };

  const src = center
    ? `https://www.mapillary.com/embed?map_style=Mapillary+streets&x=${center.lng}&y=${center.lat}&z=17&style=photo`
    : "";
  const iframeKey = center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : "none";

  const showRecenterMsg = recenteredAt !== null;

  const googleStreetUrl = center
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${center.lat},${center.lng}`
    : "#";
  const googleSatUrl = center
    ? `https://www.google.com/maps/@${center.lat},${center.lng},18z/data=!3m1!1e3`
    : "#";

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

        <div className="flex-1 min-h-0 relative bg-muted/30">
          {center ? (
            <>
              <iframe
                key={iframeKey}
                title="Mapillary street view"
                src={src}
                className="w-full h-full border-0"
                allow="geolocation; fullscreen"
                onLoad={handleIframeLoad}
              />

              {/* Loading overlay */}
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm text-center px-6">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="text-sm font-medium">Loading street-level imagery…</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Fetching the nearest community photos for {center.lat.toFixed(4)}, {center.lng.toFixed(4)}.
                  </p>
                </div>
              )}

              {/* Slow / sparse-coverage notice (non-blocking; imagery may still load) */}
              {!loading && slow && (
                <div className="absolute left-3 right-3 top-3 z-10 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 shadow-card">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Street-level coverage can be sparse in rural areas. If the view is empty, use a
                    fallback below to inspect this exact point.
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
              <MapPinned className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No GPS coordinate available</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                This visit point has no captured location, so street-level imagery cannot be shown.
              </p>
            </div>
          )}
        </div>

        {center && (
          <div className="p-3 border-t flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">No imagery here? Try a fallback:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
                <a href={`https://www.mapillary.com/app/?lat=${center.lat}&lng=${center.lng}&z=17`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" /> Mapillary
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
                <a href={googleStreetUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="h-3 w-3" /> Google Street View
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
                <a href={googleSatUrl} target="_blank" rel="noopener noreferrer">
                  <MapIcon className="h-3 w-3" /> Satellite
                </a>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
