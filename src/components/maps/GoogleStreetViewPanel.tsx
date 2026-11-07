/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Maximize2, Minimize2, RotateCcw, Compass, MapPin, Loader2, ExternalLink, Navigation, Eye, Map as MapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [panoDate, setPanoDate] = useState("");
  const [panoDistance, setPanoDistance] = useState<number | null>(null);
  const [panoId, setPanoId] = useState("");
  // When true, we render Mapillary instead of Google (auth/billing failure or no coverage).
  const [useMapillary, setUseMapillary] = useState(false);
  const [mapillaryLoading, setMapillaryLoading] = useState(true);
  const viewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
    && (lat as number) >= -90 && (lat as number) <= 90
    && (lng as number) >= -180 && (lng as number) <= 180;

  const calculateDistance = useCallback((fromLat: number, fromLng: number, toLat: number, toLng: number) => {
    const earthRadius = 6371000;
    const toRadians = (value: number) => value * Math.PI / 180;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  const calculateHeading = useCallback((fromLat: number, fromLng: number, toLat: number, toLng: number) => {
    const toRadians = (value: number) => value * Math.PI / 180;
    const fromLatitude = toRadians(fromLat);
    const toLatitude = toRadians(toLat);
    const deltaLongitude = toRadians(toLng - fromLng);
    const y = Math.sin(deltaLongitude) * Math.cos(toLatitude);
    const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
      - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(deltaLongitude);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }, []);

  const init = useCallback(async (signal: AbortSignal) => {
    if (!viewRef.current || !hasCoords) return;
    setIsLoading(true);
    setPanoLocation("");
    setPanoDate("");
    setPanoDistance(null);
    setPanoId("");

    // Short-circuit straight to Mapillary if we already know Google's key is bad.
    if (googleMapsAuthFailed) {
      setUseMapillary(true);
      setIsLoading(false);
      return;
    }

    try {
      await loadGoogleMaps();
      if(signal.aborted)return;

      // The loader resolved, but the key may still be auth-rejected (gm_authFailure
      // fires asynchronously). Re-check before continuing.
      if (googleMapsAuthFailed) {
        setUseMapillary(true);
        setIsLoading(false);
        return;
      }

      const sv = new google.maps.StreetViewService();
      const find = (radius: number, source: google.maps.StreetViewSource) =>
        new Promise<google.maps.StreetViewPanoramaData>((resolve, reject) => {
          const timer=window.setTimeout(()=>reject(new Error("Street View search timed out")),1800);
          sv.getPanorama(
            { location: { lat: lat as number, lng: lng as number }, radius, preference: google.maps.StreetViewPreference.NEAREST, source },
            (data, status) => {
              clearTimeout(timer);
              if(signal.aborted){reject(new Error("cancelled"));return;}
              if (status === google.maps.StreetViewStatus.OK && data) resolve(data);
              else reject(new Error("none"));
            },
          );
        });

      let panoData: google.maps.StreetViewPanoramaData | null = null;
      const searches: Array<[number, google.maps.StreetViewSource]> = [
        [100, google.maps.StreetViewSource.GOOGLE],
        [500, google.maps.StreetViewSource.GOOGLE],
        [1000, google.maps.StreetViewSource.GOOGLE],
        [5000, google.maps.StreetViewSource.GOOGLE],
        [25000, google.maps.StreetViewSource.GOOGLE],
        [1000, google.maps.StreetViewSource.DEFAULT],
        [5000, google.maps.StreetViewSource.DEFAULT],
        [25000, google.maps.StreetViewSource.DEFAULT],
      ];
      for (const [radius, source] of searches) {
        if(signal.aborted)return;
        try {
          panoData = await find(radius, source);
          break;
        } catch {
          // Continue through progressively wider official and contributed coverage.
        }
      }
      if (!panoData) throw new Error("No nearby street-level panorama");

      if (signal.aborted || !viewRef.current) return;

      // If auth failed while we were searching, fall back.
      if (googleMapsAuthFailed) {
        setUseMapillary(true);
        setIsLoading(false);
        return;
      }

      if (panoData.location?.description) setPanoLocation(panoData.location.description);
      if (panoData.imageDate) setPanoDate(panoData.imageDate);
      const initialPanoId = panoData.location?.pano ?? "";
      setPanoId(initialPanoId);
      const panoLatLng = panoData.location?.latLng;
      const panoLat = panoLatLng?.lat();
      const panoLng = panoLatLng?.lng();
      const initialHeading = typeof panoLat === "number" && typeof panoLng === "number"
        ? calculateHeading(panoLat, panoLng, lat as number, lng as number)
        : 0;
      if (typeof panoLat === "number" && typeof panoLng === "number") {
        setPanoDistance(calculateDistance(lat as number, lng as number, panoLat, panoLng));
      }

      const panorama = new google.maps.StreetViewPanorama(viewRef.current, {
        pano: initialPanoId,
        pov: { heading: initialHeading, pitch: 0 },
        zoom: 1.2,
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
      panorama.addListener("pano_changed", () => {
        setPanoId(panorama.getPano());
        setIsLoading(false);
      });
      panorama.addListener("status_changed", () => {
        if (panorama.getStatus() === google.maps.StreetViewStatus.OK) setIsLoading(false);
      });
      // Final safety net: if Google still hasn't rendered, fall back to Mapillary.
      setTimeout(() => {
        if(signal.aborted)return;
        if (googleMapsAuthFailed) {
          setUseMapillary(true);
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      }, 3000);
    } catch (e: unknown) {
      if(signal.aborted)return;
      // No panorama nearby, key unavailable, or load failure → Mapillary fallback.
      setUseMapillary(true);
      setIsLoading(false);
    }
  }, [lat, lng, hasCoords, calculateDistance, calculateHeading]);

  useEffect(() => {
    if (!open) return;
    setUseMapillary(false);
    setMapillaryLoading(true);
    const controller=new AbortController();
    const deadline=window.setTimeout(()=>{
      controller.abort();
      setUseMapillary(true);setIsLoading(false);
    },15000);
    void init(controller.signal).finally(()=>clearTimeout(deadline));
    const fallbackDeadline=window.setTimeout(()=>setMapillaryLoading(false),23000);
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onOpenChange(false);}};
    window.addEventListener('keydown',onKey);

    // React to async auth failures that arrive after init().
    const onAuthFail = () => { setUseMapillary(true); setIsLoading(false); };
    window.addEventListener(GOOGLE_MAPS_AUTH_FAILED_EVENT, onAuthFail);

    return () => {
      controller.abort();clearTimeout(deadline);clearTimeout(fallbackDeadline);
      window.removeEventListener('keydown',onKey);
      window.removeEventListener(GOOGLE_MAPS_AUTH_FAILED_EVENT, onAuthFail);
      if (panoramaRef.current) {
        panoramaRef.current.setVisible(false);
        google.maps.event.clearInstanceListeners(panoramaRef.current);
        panoramaRef.current = null;
      }
    };
  }, [open, init]);

  useEffect(() => {
    if (panoramaRef.current && window.google?.maps) {
      const panorama = panoramaRef.current;
      const timer=setTimeout(() => {
        if (panoramaRef.current===panorama) google.maps.event.trigger(panorama, "resize");
      }, 320);
      return()=>clearTimeout(timer);
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
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}${panoId ? `&pano=${encodeURIComponent(panoId)}` : ""}&heading=${heading}&pitch=0&fov=80`
    : "#";
  const googleStreetLink = hasCoords
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/90 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className={`flex flex-col overflow-hidden bg-background shadow-2xl ring-1 ring-border ${
          isFullscreen ? "fixed inset-0 rounded-none" : "h-full w-full sm:h-[88vh] sm:max-w-4xl sm:rounded-lg"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 bg-primary px-3 py-2.5 text-primary-foreground shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary">
              <Navigation className="h-4 w-4 text-secondary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{title}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-primary-foreground/80 truncate">
                {panoLocation ? <span className="truncate">{panoLocation}</span> : hasCoords ? (
                  <><MapPin className="h-3 w-3" />{(lat as number).toFixed(5)}, {(lng as number).toFixed(5)}
                  {typeof accuracy === "number" && Number.isFinite(accuracy) ? ` · ±${accuracy.toFixed(0)}m` : ""}</>
                ) : "No location"}
                {!useMapillary && (
                  <span className="ml-1 inline-flex items-center gap-0.5"><Compass className="h-3 w-3" />{heading}°</span>
                )}
                {!useMapillary && panoDistance !== null && (
                  <span className="ml-1">· {panoDistance < 1000 ? `${Math.round(panoDistance)} m` : `${(panoDistance / 1000).toFixed(1)} km`} away</span>
                )}
                {!useMapillary && panoDate && <span className="ml-1">· {panoDate}</span>}
                {useMapillary && <span className="ml-1 text-status-warning">· Mapillary</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!useMapillary && (
              <Button variant="ghost" size="icon" onClick={resetView} title="Reset view" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setIsFullscreen((v) => !v)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} title="Close" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0 bg-background">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-status-warning" />
                  <p className="text-sm text-muted-foreground">Loading street-level imagery…</p>
                  <p className="text-xs text-muted-foreground">Community photos near {(lat as number).toFixed(4)}, {(lng as number).toFixed(4)}</p>
                </div>
              )}
            </>
          )}

          {/* Loading (Google search phase) */}
          {isLoading && !useMapillary && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-status-warning" />
              <p className="text-sm text-muted-foreground">Finding nearest Street View…</p>
              <p className="text-xs text-muted-foreground">Searching nearby official and contributed panoramas</p>
            </div>
          )}

          {/* No coords at all */}
          {!hasCoords && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-primary-foreground">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
                <MapPin className="h-7 w-7 text-status-warning" />
              </div>
              <p className="max-w-sm text-sm text-foreground">No GPS coordinate available for this point.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-primary px-3 py-1.5 text-primary-foreground shrink-0">
          {hasCoords ? (
            useMapillary ? (
              <div className="flex flex-wrap items-center gap-3">
                <a href={mapillaryAppLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-foreground hover:underline">
                  <Eye className="h-3 w-3" /> Open in Mapillary
                </a>
                <a href={googleStreetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-foreground hover:underline">
                  <ExternalLink className="h-3 w-3" /> Try Google Street View
                </a>
                <a href={googleSatLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-foreground hover:underline">
                  <MapIcon className="h-3 w-3" /> Satellite
                </a>
              </div>
            ) : (
              <a href={gmapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-foreground hover:underline">
                <ExternalLink className="h-3 w-3" /> Open in Google Maps
              </a>
            )
          ) : <span />}
          <span className="text-[10px] text-muted-foreground">
            {useMapillary ? "Imagery © Mapillary contributors" : `Imagery © ${new Date().getFullYear()} Google`}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
