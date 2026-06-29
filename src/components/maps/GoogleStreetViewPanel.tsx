/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Maximize2, Minimize2, RotateCcw, Compass, MapPin, Loader2, ExternalLink, Navigation,
} from "lucide-react";
import { loadGoogleMaps } from "@/lib/maps/googleMapsLoader";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number | null;
  lng: number | null;
  accuracy?: number | null;
  title?: string;
}

/**
 * Unified, beautiful Google Street View panel used across every satellite map.
 * Searches up to 5km for the nearest panorama and surfaces clear loading,
 * error and fallback states.
 */
export default function GoogleStreetViewPanel({
  open, onOpenChange, lat, lng, accuracy, title = "Street View",
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState(0);
  const [panoLocation, setPanoLocation] = useState("");
  const viewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const init = useCallback(async () => {
    if (!viewRef.current || !hasCoords) return;
    setIsLoading(true);
    setError(null);
    setPanoLocation("");
    try {
      await loadGoogleMaps();
      const sv = new google.maps.StreetViewService();
      const find = (radius: number) =>
        new Promise<google.maps.StreetViewPanoramaData>((resolve, reject) => {
          sv.getPanorama(
            { location: { lat: lat as number, lng: lng as number }, radius, preference: google.maps.StreetViewPreference.NEAREST, source: google.maps.StreetViewSource.DEFAULT },
            (data, status) => {
              if (status === google.maps.StreetViewStatus.OK && data) resolve(data);
              else reject(new Error("none"));
            },
          );
        });

      let panoData: google.maps.StreetViewPanoramaData;
      try { panoData = await find(1000); }
      catch { panoData = await find(5000); }

      if (!viewRef.current) return;
      if (panoData.location?.description) setPanoLocation(panoData.location.description);

      const panorama = new google.maps.StreetViewPanorama(viewRef.current, {
        pano: panoData.location?.pano,
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: true,
        addressControlOptions: { position: google.maps.ControlPosition.BOTTOM_CENTER },
        enableCloseButton: false,
        fullscreenControl: false,
        imageDateControl: true,
        linksControl: true,
        motionTracking: true,
        motionTrackingControl: true,
        panControl: true,
        scrollwheel: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        visible: true,
        showRoadLabels: true,
      });
      panoramaRef.current = panorama;
      panorama.addListener("pov_changed", () => setHeading(Math.round(panorama.getPov().heading)));
      panorama.addListener("pano_changed", () => setIsLoading(false));
      panorama.addListener("status_changed", () => {
        if (panorama.getStatus() === google.maps.StreetViewStatus.OK) { setIsLoading(false); setError(null); }
      });
      setTimeout(() => setIsLoading(false), 3000);
    } catch (e: any) {
      setIsLoading(false);
      setError(
        e?.message === "none"
          ? "No Street View imagery found within 5 km of this point. This area may not have street-level coverage yet."
          : "Couldn't load Street View. Check your connection and try again.",
      );
    }
  }, [lat, lng, hasCoords]);

  useEffect(() => {
    if (!open) return;
    init();
    return () => {
      if (panoramaRef.current) {
        google.maps.event.clearInstanceListeners(panoramaRef.current);
        panoramaRef.current = null;
      }
    };
  }, [open, init]);

  useEffect(() => {
    if (panoramaRef.current && window.google?.maps) {
      setTimeout(() => google.maps.event.trigger(panoramaRef.current!, "resize"), 320);
    }
  }, [isFullscreen]);

  // Reset fullscreen on close.
  useEffect(() => { if (!open) setIsFullscreen(false); }, [open]);

  const resetView = () => {
    if (panoramaRef.current) {
      panoramaRef.current.setPov({ heading: 0, pitch: 0 });
      panoramaRef.current.setZoom(1);
    }
  };

  if (!open) return null;

  const gmapsLink = hasCoords
    ? `https://www.google.com/maps/@${lat},${lng},3a,75y,${heading}h,90t/data=!3m4!1e1!3m2!1s!2e0`
    : "#";

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className={`flex flex-col overflow-hidden bg-background shadow-2xl ring-1 ring-white/10 ${
          isFullscreen ? "fixed inset-0 rounded-none" : "h-full w-full sm:h-[88vh] sm:max-w-4xl sm:rounded-2xl"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#0b1f33] to-[#123a5c] px-3 py-2.5 text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FBBC05]">
              <Navigation className="h-4 w-4 text-[#0b1f33]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{title}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/60 truncate">
                {panoLocation ? <span className="truncate">{panoLocation}</span> : hasCoords ? (
                  <><MapPin className="h-3 w-3" />{(lat as number).toFixed(5)}, {(lng as number).toFixed(5)}
                  {typeof accuracy === "number" && Number.isFinite(accuracy) ? ` · ±${accuracy.toFixed(0)}m` : ""}</>
                ) : "No location"}
                <span className="ml-1 inline-flex items-center gap-0.5"><Compass className="h-3 w-3" />{heading}°</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={resetView} title="Reset view" className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/15">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={() => setIsFullscreen((v) => !v)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/15">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={() => onOpenChange(false)} title="Close" className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/15">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0 bg-[#202124]">
          <div ref={viewRef} className="h-full w-full" />

          {isLoading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#202124] text-white">
              <Loader2 className="h-8 w-8 animate-spin text-[#FBBC05]" />
              <p className="text-sm text-white/70">Finding nearest Street View…</p>
              <p className="text-xs text-white/40">Searching up to 5 km for imagery</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10">
                <MapPin className="h-7 w-7 text-[#FBBC05]" />
              </div>
              <p className="max-w-sm text-sm text-white/80">{error}</p>
              {hasCoords && (
                <a href={gmapsLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#8ab4f8] hover:underline">
                  <ExternalLink className="h-3 w-3" /> Try opening in Google Maps
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 bg-[#0b1f33] px-3 py-1.5 text-white shrink-0">
          {hasCoords ? (
            <a href={gmapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8ab4f8] hover:underline">
              <ExternalLink className="h-3 w-3" /> Open in Google Maps
            </a>
          ) : <span />}
          <span className="text-[10px] text-white/40">Imagery © {new Date().getFullYear()} Google</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
