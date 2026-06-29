/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Maximize2, Minimize2, RotateCcw, Compass, MapPin, Loader2, ExternalLink, Navigation, Eye, Map as MapIcon,
} from "lucide-react";
import {
  loadGoogleMaps,
  googleMapsAuthFailed,
  GOOGLE_MAPS_AUTH_FAILED_EVENT,
} from "@/lib/maps/googleMapsLoader";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number | null;
  lng: number | null;
  accuracy?: number | null;
  title?: string;
}

/**
 * Unified, beautiful Street View panel used across every satellite map.
 *
 * Primary provider: Google Street View (searches up to 5km for the nearest
 * panorama). If the Google Maps key is rejected (billing disabled, referrer
 * not allowed, API not enabled) or no panorama exists nearby, the panel
 * automatically and seamlessly falls back to Mapillary community street
 * imagery — so users NEVER see Google's broken "development purposes only"
 * overlay or a dead end.
 */
export default function GoogleStreetViewPanel({
  open, onOpenChange, lat, lng, accuracy, title = "Street View",
}: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [heading, setHeading] = useState(0);
  const [panoLocation, setPanoLocation] = useState("");
  // When true, we render Mapillary instead of Google (auth/billing failure or no coverage).
  const [useMapillary, setUseMapillary] = useState(false);
  const [mapillaryLoading, setMapillaryLoading] = useState(true);
  const viewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const init = useCallback(async () => {
    if (!viewRef.current || !hasCoords) return;
    setIsLoading(true);
    setPanoLocation("");

    // Short-circuit straight to Mapillary if we already know Google's key is bad.
    if (googleMapsAuthFailed) {
      setUseMapillary(true);
      setIsLoading(false);
      return;
    }

    try {
      await loadGoogleMaps();

      // The loader resolved, but the key may still be auth-rejected (gm_authFailure
      // fires asynchronously). Re-check before continuing.
      if (googleMapsAuthFailed) {
        setUseMapillary(true);
        setIsLoading(false);
        return;
      }

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

      // If auth failed while we were searching, fall back.
      if (googleMapsAuthFailed) {
        setUseMapillary(true);
        setIsLoading(false);
        return;
      }

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
        if (panorama.getStatus() === google.maps.StreetViewStatus.OK) setIsLoading(false);
      });
      // Final safety net: if Google still hasn't rendered, fall back to Mapillary.
      setTimeout(() => {
        if (googleMapsAuthFailed) {
          setUseMapillary(true);
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      }, 3000);
    } catch (e: unknown) {
      // No panorama nearby, key unavailable, or load failure → Mapillary fallback.
      setUseMapillary(true);
      setIsLoading(false);
    }
  }, [lat, lng, hasCoords]);

  useEffect(() => {
    if (!open) return;
    setUseMapillary(false);
    setMapillaryLoading(true);
    init();

    // React to async auth failures that arrive after init().
    const onAuthFail = () => { setUseMapillary(true); setIsLoading(false); };
    window.addEventListener(GOOGLE_MAPS_AUTH_FAILED_EVENT, onAuthFail);

    return () => {
      window.removeEventListener(GOOGLE_MAPS_AUTH_FAILED_EVENT, onAuthFail);
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

  const mapillaryEmbed = hasCoords
    ? `https://www.mapillary.com/embed?map_style=Mapillary+streets&x=${lng}&y=${lat}&z=17&style=photo`
    : "";
  const mapillaryAppLink = hasCoords
    ? `https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17`
    : "#";
  const googleSatLink = hasCoords
    ? `https://www.google.com/maps/@${lat},${lng},18z/data=!3m1!1e3`
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
                {!useMapillary && (
                  <span className="ml-1 inline-flex items-center gap-0.5"><Compass className="h-3 w-3" />{heading}°</span>
                )}
                {useMapillary && <span className="ml-1 text-[#FBBC05]">· Mapillary</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!useMapillary && (
              <button onClick={resetView} title="Reset view" className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/15">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
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
          {/* Google Street View target (kept mounted only when not using Mapillary) */}
          {!useMapillary && <div ref={viewRef} className="h-full w-full" />}

          {/* Mapillary fallback */}
          {useMapillary && hasCoords && (
            <>
              <iframe
                key={mapillaryEmbed}
                title="Mapillary street view"
                src={mapillaryEmbed}
                className="h-full w-full border-0"
                allow="geolocation; fullscreen"
                onLoad={() => setMapillaryLoading(false)}
              />
              {mapillaryLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#202124] text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FBBC05]" />
                  <p className="text-sm text-white/70">Loading street-level imagery…</p>
                  <p className="text-xs text-white/40">Community photos near {(lat as number).toFixed(4)}, {(lng as number).toFixed(4)}</p>
                </div>
              )}
            </>
          )}

          {/* Loading (Google search phase) */}
          {isLoading && !useMapillary && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#202124] text-white">
              <Loader2 className="h-8 w-8 animate-spin text-[#FBBC05]" />
              <p className="text-sm text-white/70">Finding nearest Street View…</p>
              <p className="text-xs text-white/40">Searching up to 5 km for imagery</p>
            </div>
          )}

          {/* No coords at all */}
          {!hasCoords && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10">
                <MapPin className="h-7 w-7 text-[#FBBC05]" />
              </div>
              <p className="max-w-sm text-sm text-white/80">No GPS coordinate available for this point.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b1f33] px-3 py-1.5 text-white shrink-0">
          {hasCoords ? (
            useMapillary ? (
              <div className="flex flex-wrap items-center gap-3">
                <a href={mapillaryAppLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8ab4f8] hover:underline">
                  <Eye className="h-3 w-3" /> Open in Mapillary
                </a>
                <a href={googleSatLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8ab4f8] hover:underline">
                  <MapIcon className="h-3 w-3" /> Satellite
                </a>
              </div>
            ) : (
              <a href={gmapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8ab4f8] hover:underline">
                <ExternalLink className="h-3 w-3" /> Open in Google Maps
              </a>
            )
          ) : <span />}
          <span className="text-[10px] text-white/40">
            {useMapillary ? "Imagery © Mapillary contributors" : `Imagery © ${new Date().getFullYear()} Google`}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
