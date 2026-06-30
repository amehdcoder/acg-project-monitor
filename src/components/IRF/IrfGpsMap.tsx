import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, RefreshCw, CheckCircle2, Hand, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";

export interface IrfGpsValue {
  lat: number;
  lng: number;
  accuracy: number;
  /** True when the point was placed by hand because the device GPS failed. */
  manual?: boolean;
}

interface Props {
  value: IrfGpsValue | null;
  onChange: (v: IrfGpsValue | null) => void;
  accent?: string;
}

const ESRI_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// Centre of Nigeria — used to seed the manual-placement map when the device
// has no fix yet so the user can pan/zoom to their location and tap.
const NIGERIA_CENTER: [number, number] = [9.082, 8.6753];

// If the device produces no fix at all within this window we surface the manual
// fallback so the form can never become permanently unsubmittable.
const MANUAL_FALLBACK_MS = 12000;

/**
 * GPS capture with an instant best-zoom satellite map. As soon as a fix is
 * acquired the map flies to the device location, drops a marker and renders an
 * accuracy halo so the field user can confirm exactly where they are standing.
 *
 * If the device cannot produce a fix (permission denied, indoors, old WebView,
 * weak hardware) the component falls back to MANUAL placement: it shows a
 * satellite map the user can pan/zoom and tap to drop their activity point.
 * This guarantees the location field is always completable.
 */
export default function IrfGpsMap({ value, onChange, accent = "#0891b2" }: Props) {
  const { position, isLoading, error, getCurrentPosition } = useGeolocation();
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [manualMode, setManualMode] = useState(false);
  const [fallbackOffered, setFallbackOffered] = useState(false);
  // Ref mirror of manualMode so the (once-built) map click handler reads fresh state.
  const manualModeRef = useRef(manualMode);
  manualModeRef.current = manualMode;

  // Auto-capture on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    try { getCurrentPosition(); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offer the manual fallback if the device never produces a fix in time.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!value) setFallbackOffered(true);
    }, MANUAL_FALLBACK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A geolocation error means manual placement is the only path forward.
  useEffect(() => {
    if (error && !value) setFallbackOffered(true);
  }, [error, value]);

  // Adopt the first device fix, then any more-accurate fix — but never override
  // a point the user placed by hand.
  useEffect(() => {
    if (!position || manualMode) return;
    if (value?.manual) return;
    if (!value || position.accuracy < value.accuracy) {
      onChange({ lat: position.lat, lng: position.lng, accuracy: position.accuracy });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const showMap = !!value || manualMode;

  // Build the map once we have something to show (a value or manual mode).
  useEffect(() => {
    if (!showMap || !containerRef.current) return;
    if (!mapRef.current) {
      const center: [number, number] = value
        ? [value.lat, value.lng]
        : NIGERIA_CENTER;
      const map = L.map(containerRef.current, {
        center,
        zoom: value ? 18 : 6,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      L.tileLayer(ESRI_SAT, { maxZoom: 21, maxNativeZoom: 19 }).addTo(map);
      L.tileLayer(ESRI_LABELS, { maxZoom: 21, maxNativeZoom: 19, opacity: 0.9 }).addTo(map);
      // Tap-to-place: only commit a manual point while in manual mode.
      map.on("click", (e: L.LeafletMouseEvent) => {
        if (!manualModeRef.current) return;
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng, accuracy: 0, manual: true });
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 120);
    }
    const map = mapRef.current;
    if (!value) return;
    const latlng: L.LatLngExpression = [value.lat, value.lng];

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${accent};border:3px solid #fff;box-shadow:0 0 0 2px ${accent},0 2px 6px rgba(0,0,0,.5)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      markerRef.current = L.marker(latlng, { icon }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }

    const haloRadius = Math.max(value.manual ? 0 : value.accuracy, value.manual ? 0 : 5);
    if (value.manual) {
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
    } else if (!circleRef.current) {
      circleRef.current = L.circle(latlng, {
        radius: haloRadius,
        color: accent,
        weight: 1,
        fillColor: accent,
        fillOpacity: 0.15,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(latlng).setRadius(haloRadius);
    }

    // Best zoom that still shows the accuracy halo.
    const zoom = value.manual ? 18 : value.accuracy <= 20 ? 19 : value.accuracy <= 60 ? 18 : value.accuracy <= 150 ? 17 : 16;
    map.setView(latlng, zoom, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, value?.lat, value?.lng, value?.accuracy, value?.manual, accent]);

  // Keep a ref to manualMode for the (stable) map click handler.
  const manualModeRef = useRef(manualMode);
  manualModeRef.current = manualMode;

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  const quality = !value
    ? ""
    : value.manual
      ? "Manual"
      : value.accuracy < 15 ? "Excellent" : value.accuracy < 40 ? "Good" : value.accuracy < 120 ? "Fair" : "Poor";

  const enterManual = () => {
    setManualMode(true);
    setFallbackOffered(true);
    // Clear any stale auto fix so the user explicitly drops a point.
    if (!value) onChange(null);
  };

  const retryGps = () => {
    setManualMode(false);
    onChange(null);
    if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
    getCurrentPosition();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-input">
      <div className="flex items-center justify-between gap-2 bg-muted/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" style={{ color: accent }} />
          {value ? (
            <span className="flex items-center gap-1.5 truncate text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-mono">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>
              <span className="text-muted-foreground">
                {value.manual ? "· Manual point" : `· ±${Math.round(value.accuracy)}m (${quality})`}
              </span>
            </span>
          ) : manualMode ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hand className="h-3.5 w-3.5" /> Tap the map to drop your activity point
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Acquiring GPS…
            </span>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          aria-label="Refresh GPS" onClick={retryGps} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {showMap ? (
        <div ref={containerRef} className="h-52 w-full" />
      ) : (
        <div className="flex h-52 w-full flex-col items-center justify-center gap-2 bg-muted/30 px-4 text-center text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-xs">Locking the device satellite position…</p>
        </div>
      )}

      {/* Manual fallback affordances — always reachable so the field is never a dead-end. */}
      {(fallbackOffered || error) && !value && (
        <div className="flex flex-col gap-2 border-t border-input bg-amber-500/10 px-3 py-2">
          <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error || "GPS is taking a while. You can pan the satellite map and tap your exact spot to set the location manually."}</span>
          </div>
          {!manualMode && (
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={enterManual}>
              <Hand className="h-3.5 w-3.5" /> Set location manually
            </Button>
          )}
        </div>
      )}
      {value?.manual && (
        <div className="border-t border-input bg-muted/40 px-3 py-2">
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={retryGps}>
            <RefreshCw className="h-3.5 w-3.5" /> Try device GPS instead
          </Button>
        </div>
      )}
    </div>
  );
}
