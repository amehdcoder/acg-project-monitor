/// <reference types="google.maps" />
/**
 * Mobile-friendly GPS pin preview.
 *
 * Shows a mini satellite map with the exact captured pin (plus the basemap
 * verdict) BEFORE the user launches the full Street View experience, so a
 * supervisor on a phone can confirm they are opening the right point.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ExternalLink, MapPin, Copy } from "lucide-react";
import { toast } from "sonner";
import { loadGoogleMaps, googleMapsAuthFailed } from "@/lib/maps/googleMapsLoader";
import { STATUS_META, type VerifyResult } from "@/lib/isc/gpsVerification";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  point: { lat: number; lng: number; community: string; ward?: string; lga?: string; state?: string; verify?: VerifyResult } | null;
  onLaunchStreetView: () => void;
}

export default function GpsPointPreviewDialog({ open, onOpenChange, point, onLaunchStreetView }: Props) {
  const div = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !point) return;
    let cancelled = false;
    let lmap: L.Map | null = null;
    const el = div.current;
    if (!el) return;
    const center = { lat: point.lat, lng: point.lng };

    (async () => {
      try {
        if (googleMapsAuthFailed) throw new Error("auth");
        await loadGoogleMaps();
        if (cancelled || googleMapsAuthFailed) throw new Error("auth");
        const map = new google.maps.Map(el, {
          center, zoom: 18, mapTypeId: google.maps.MapTypeId.HYBRID,
          maxZoom: 22, streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
          gestureHandling: "greedy",
        });
        new google.maps.Marker({
          position: center, map, title: point.community,
          icon: {
            path: google.maps.SymbolPath.CIRCLE, scale: 9,
            fillColor: STATUS_META[point.verify?.status ?? "unknown"].color,
            fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3,
          },
        });
      } catch {
        if (cancelled) return;
        lmap = L.map(el, { zoomControl: true, attributionControl: false }).setView([center.lat, center.lng], 18);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 22, maxNativeZoom: 21, detectRetina: true },
        ).addTo(lmap);
        L.circleMarker([center.lat, center.lng], {
          radius: 8, color: "#fff", weight: 3, fillOpacity: 1,
          fillColor: STATUS_META[point.verify?.status ?? "unknown"].color,
        }).addTo(lmap);
        setTimeout(() => { try { lmap?.invalidateSize(); } catch { /* noop */ } }, 80);
      }
    })();

    return () => { cancelled = true; if (lmap) { lmap.remove(); lmap = null; } };
  }, [open, point]);

  if (!point) return null;
  const meta = STATUS_META[point.verify?.status ?? "unknown"];
  const coords = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[96vw] max-w-lg overflow-y-auto p-0">
        <DialogHeader className="px-4 pb-2 pt-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" /> {point.community}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {[point.ward, point.lga, point.state].filter(Boolean).join(" · ") || "Location preview"}
          </DialogDescription>
        </DialogHeader>

        <div ref={div} className="h-[46dvh] min-h-[220px] w-full border-y border-border" />

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge style={{ background: meta.color }} className="text-white">{meta.label}</Badge>
            <Badge variant="outline" className="font-mono">{point.verify?.score ?? 0}% match</Badge>
            {point.verify?.matchedName && (
              <Badge variant="secondary" className="max-w-[220px] truncate">Basemap: {point.verify.matchedName}</Badge>
            )}
          </div>
          {point.verify?.reason && <p className="text-xs text-muted-foreground">{point.verify.reason}</p>}

          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(coords); toast.success("Coordinates copied"); }}
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left font-mono text-xs hover:bg-muted/50"
          >
            {coords}
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-11 w-full" onClick={onLaunchStreetView}>
              <Eye className="mr-1.5 h-4 w-4" /> Open Street View
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`, "_blank", "noopener")}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" /> Google Maps
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
