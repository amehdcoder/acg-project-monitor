import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";

export interface IrfGpsValue {
  lat: number;
  lng: number;
  accuracy: number;
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

/**
 * GPS capture with an instant best-zoom satellite map. As soon as a fix is
 * acquired the map flies to the device location, drops a marker and renders an
 * accuracy halo so the field user can confirm exactly where they are standing.
 */
export default function IrfGpsMap({ value, onChange, accent = "#0891b2" }: Props) {
  const { position, isLoading, getCurrentPosition } = useGeolocation();
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  // Auto-capture on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    try { getCurrentPosition(); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopt the first fix, then any more-accurate fix.
  useEffect(() => {
    if (!position) return;
    if (!value || position.accuracy < value.accuracy) {
      onChange({ lat: position.lat, lng: position.lng, accuracy: position.accuracy });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // Build the map once a value exists.
  useEffect(() => {
    if (!value || !containerRef.current) return;
    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        center: [value.lat, value.lng],
        zoom: 18,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      L.tileLayer(ESRI_SAT, { maxZoom: 21, maxNativeZoom: 19 }).addTo(map);
      L.tileLayer(ESRI_LABELS, { maxZoom: 21, maxNativeZoom: 19, opacity: 0.9 }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 120);
    }
    const map = mapRef.current;
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

    if (!circleRef.current) {
      circleRef.current = L.circle(latlng, {
        radius: Math.max(value.accuracy, 5),
        color: accent,
        weight: 1,
        fillColor: accent,
        fillOpacity: 0.15,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(latlng).setRadius(Math.max(value.accuracy, 5));
    }

    // Best zoom that still shows the accuracy halo.
    const zoom = value.accuracy <= 20 ? 19 : value.accuracy <= 60 ? 18 : value.accuracy <= 150 ? 17 : 16;
    map.setView(latlng, zoom, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng, value?.accuracy, accent]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  const quality = !value ? "" : value.accuracy < 15 ? "Excellent" : value.accuracy < 40 ? "Good" : value.accuracy < 120 ? "Fair" : "Poor";

  return (
    <div className="overflow-hidden rounded-xl border border-input">
      <div className="flex items-center justify-between gap-2 bg-muted/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" style={{ color: accent }} />
          {value ? (
            <span className="flex items-center gap-1.5 truncate text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-mono">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>
              <span className="text-muted-foreground">· ±{Math.round(value.accuracy)}m ({quality})</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Acquiring GPS…
            </span>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          aria-label="Refresh GPS" onClick={() => { onChange(null); getCurrentPosition(); }} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {value ? (
        <div ref={containerRef} className="h-52 w-full" />
      ) : (
        <div className="flex h-52 w-full flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-xs">Locking the device satellite position…</p>
        </div>
      )}
    </div>
  );
}
